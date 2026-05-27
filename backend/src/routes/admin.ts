import { Router, type Request } from 'express';
import fs from 'node:fs/promises';
import { z } from 'zod';
import { CampaignStatus, Prisma, WithdrawalRequestStatus } from '@prisma/client';
import { asyncHandler } from '../lib/asyncHandler.js';
import { prisma } from '../lib/prisma.js';
import { uploadsFsPathFromPublicUrl } from '../lib/uploadPaths.js';
import {
  authenticate,
  requireAdmin,
  attachAdminPanelContext,
  requireAdminPanel,
  requireAnyAdminPanel,
  hashPassword,
  AuthRequest
} from '../lib/auth.js';
import { recordActivity } from '../lib/activityLog.js';
import { notifyCreatorCampaignDecision, notifyCreatorWithdrawalStatus } from '../lib/mail.js';
import { assertCanAssignPermissions, hasAdminPanelAccess } from '../config/adminPermissions.js';
import {
  getEasypayPartnerApiCredentialsOk,
  provisionEasypayTenant
} from '../lib/easypayPartner.js';
import { computeDaysLeftFromEndsAt } from '../lib/campaignEndsAt.js';
import {
  getLastDonationAt,
  isInactiveForAdminEnd,
  tryFinalizeCampaignEnded
} from '../lib/campaignLifecycle.js';
import { serializeWithdrawalPayout } from '../lib/payoutMethods.js';
import { serializePlatformBankAccount } from '../lib/platformBankAccountSerialize.js';
import { serializeBankTransferIntent } from '../lib/bankTransferSerialize.js';
import { expireStaleBankTransferIntents } from '../lib/expireBankTransfers.js';
import {
  confirmBankTransferIntent,
  sendBankTransferConfirmedEmails
} from '../lib/finalizeBankTransfer.js';
import { sendBankTransferRejectedEmail } from '../lib/mail.js';
import { HttpError } from '../lib/HttpError.js';

const adminRouter = Router();

adminRouter.use(authenticate);
adminRouter.use(requireAdmin);
adminRouter.use(asyncHandler(attachAdminPanelContext));

function otherAdminsWhoCanManageAdmins(excludeUserId: string): Promise<number> {
  return prisma.user
    .findMany({
      where: { role: 'ADMIN', isActive: true, id: { not: excludeUserId } },
      select: { adminPanelPermissions: true }
    })
    .then(
      (rows) =>
        rows.filter(
          (r) => r.adminPanelPermissions.length === 0 || r.adminPanelPermissions.includes('admins')
        ).length
    );
}

function canManageAdminsList(perms: string[]): boolean {
  return perms.length === 0 || perms.includes('admins');
}

const MAX_ADMIN_PAGE_SIZE = 50;
const AUDIT_EXPORT_MAX_ROWS = 2000;

function parseAuditFilters(query: Request['query']): {
  where: Prisma.ActivityLogWhereInput;
} {
  const conditions: Prisma.ActivityLogWhereInput[] = [];

  const typeRaw = typeof query.type === 'string' ? query.type.trim() : '';
  if (typeRaw) {
    conditions.push({ type: typeRaw });
  }

  const fromRaw = typeof query.from === 'string' ? query.from.trim() : '';
  if (fromRaw) {
    const from = new Date(fromRaw);
    if (!Number.isNaN(from.getTime())) {
      conditions.push({ createdAt: { gte: from } });
    }
  }

  const toRaw = typeof query.to === 'string' ? query.to.trim() : '';
  if (toRaw) {
    const to = new Date(toRaw);
    if (!Number.isNaN(to.getTime())) {
      const end = new Date(to);
      end.setUTCHours(23, 59, 59, 999);
      conditions.push({ createdAt: { lte: end } });
    }
  }

  const qRaw = typeof query.q === 'string' ? query.q.trim() : '';
  if (qRaw) {
    conditions.push({
      OR: [
        { title: { contains: qRaw, mode: 'insensitive' } },
        { detail: { contains: qRaw, mode: 'insensitive' } }
      ]
    });
  }

  return {
    where: conditions.length ? { AND: conditions } : {}
  };
}

function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function parsePagination(
  query: Request['query'],
  defaultPageSize = 12
): {
  page: number;
  pageSize: number;
  skip: number;
} {
  const pageRaw = Number.parseInt(typeof query.page === 'string' ? query.page : '1', 10);
  const sizeRaw = Number.parseInt(
    typeof query.pageSize === 'string' ? query.pageSize : String(defaultPageSize),
    10
  );
  const page = Number.isFinite(pageRaw) ? Math.max(1, pageRaw) : 1;
  const pageSizeRaw = Number.isFinite(sizeRaw) ? Math.max(1, sizeRaw) : defaultPageSize;
  const pageSize = Math.min(MAX_ADMIN_PAGE_SIZE, pageSizeRaw);
  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize
  };
}

adminRouter.get(
  '/notifications/summary',
  asyncHandler(async (req: AuthRequest, res) => {
    const canAccess = (key: Parameters<typeof hasAdminPanelAccess>[2]) =>
      hasAdminPanelAccess('ADMIN', req.adminPanelPermissions, key);

    const items: Array<{
      id: string;
      label: string;
      count: number;
      tab: string;
    }> = [];

    const fetches: Promise<void>[] = [];

    if (canAccess('queue')) {
      fetches.push(
        prisma.campaign
          .count({ where: { status: 'PendingReview' } })
          .then((count) => {
            items.push({
              id: 'campaign_reviews',
              label: 'Campaign reviews',
              count,
              tab: 'queue'
            });
          })
      );
    }

    if (canAccess('queue') || canAccess('campaigns')) {
      fetches.push(
        prisma.campaignExtensionRequest
          .count({ where: { status: 'Pending' } })
          .then((count) => {
            items.push({
              id: 'extension_requests',
              label: 'Extension requests',
              count,
              tab: canAccess('queue') ? 'queue' : 'campaigns'
            });
          })
      );
    }

    if (canAccess('withdrawals')) {
      fetches.push(
        prisma.withdrawalRequest
          .count({ where: { status: 'Pending' } })
          .then((count) => {
            items.push({
              id: 'withdrawals',
              label: 'Withdrawal requests',
              count,
              tab: 'withdrawals'
            });
          })
      );
    }

    if (canAccess('bank')) {
      fetches.push(
        (async () => {
          await expireStaleBankTransferIntents();
          const count = await prisma.bankTransferIntent.count({ where: { status: 'Pending' } });
          items.push({
            id: 'bank_transfers',
            label: 'Bank transfers',
            count,
            tab: 'bank'
          });
        })()
      );
    }

    await Promise.all(fetches);

    const order = ['campaign_reviews', 'extension_requests', 'withdrawals', 'bank_transfers'];
    items.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));

    res.json({
      total: items.reduce((sum, item) => sum + item.count, 0),
      items
    });
  })
);

adminRouter.get(
  '/audit/export.csv',
  requireAdminPanel('audit'),
  asyncHandler(async (req: Request, res) => {
    const { where } = parseAuditFilters(req.query);
    const rows = await prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: AUDIT_EXPORT_MAX_ROWS
    });
    const actorIds = [...new Set(rows.map((r) => r.actorId).filter((id): id is string => id != null))];
    const actors =
      actorIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: actorIds } },
            select: { id: true, email: true, fullName: true }
          })
        : [];
    const actorMap = new Map(actors.map((u) => [u.id, u]));

    const header = [
      'createdAt',
      'type',
      'title',
      'detail',
      'actorEmail',
      'actorFullName',
      'campaignId',
      'userId',
      'actorId'
    ];
    const lines = [
      header.join(','),
      ...rows.map((r) => {
        const a = r.actorId ? actorMap.get(r.actorId) : undefined;
        return [
          csvEscape(r.createdAt.toISOString()),
          csvEscape(r.type),
          csvEscape(r.title),
          csvEscape(r.detail ?? ''),
          csvEscape(a?.email ?? ''),
          csvEscape(a?.fullName ?? ''),
          csvEscape(r.campaignId ?? ''),
          csvEscape(r.userId ?? ''),
          csvEscape(r.actorId ?? '')
        ].join(',');
      })
    ];
    const body = '\uFEFF' + lines.join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="admin-audit-log.csv"');
    res.send(body);
  })
);

adminRouter.get(
  '/audit',
  requireAdminPanel('audit'),
  asyncHandler(async (req: Request, res) => {
    const { page, pageSize, skip } = parsePagination(req.query, 25);
    const { where } = parseAuditFilters(req.query);
    const [total, items] = await Promise.all([
      prisma.activityLog.count({ where }),
      prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize
      })
    ]);
    const actorIds = [...new Set(items.map((r) => r.actorId).filter((id): id is string => id != null))];
    const actors =
      actorIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: actorIds } },
            select: { id: true, email: true, fullName: true }
          })
        : [];
    const actorMap = new Map(actors.map((u) => [u.id, u]));
    res.json({
      items: items.map((row) => ({
        id: row.id,
        type: row.type,
        title: row.title,
        detail: row.detail,
        campaignId: row.campaignId,
        userId: row.userId,
        actorId: row.actorId,
        createdAt: row.createdAt.toISOString(),
        actor: row.actorId
          ? (() => {
              const a = actorMap.get(row.actorId);
              return a ? { id: a.id, email: a.email, fullName: a.fullName } : null;
            })()
          : null
      })),
      total,
      page,
      pageSize
    });
  })
);

adminRouter.get(
  '/activity',
  requireAdminPanel('overview'),
  asyncHandler(async (req: Request, res) => {
    const { page, pageSize, skip } = parsePagination(req.query, 10);
    const [total, items] = await Promise.all([
      prisma.activityLog.count(),
      prisma.activityLog.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize
      })
    ]);
    res.json({ items, total, page, pageSize });
  })
);

const approveCampaignSchema = z.object({
  status: z.enum(['Active', 'Rejected', 'Closed', 'Ended'])
});

const reviewExtensionSchema = z.object({
  status: z.enum(['Approved', 'Rejected']),
  adminNote: z.string().max(500).optional()
});

const patchWithdrawalRequestSchema = z
  .object({
    status: z.enum(['Approved', 'Rejected', 'Paid']),
    adminNote: z.string().max(500).optional(),
    payoutReference: z.string().min(1).max(255).optional()
  })
  .superRefine((data, ctx) => {
    if (data.status === 'Paid' && !data.payoutReference?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Payout reference is required when marking as paid (e.g. transfer ID or receipt note)',
        path: ['payoutReference']
      });
    }
  });

// Get all pending campaigns
adminRouter.get(
  '/campaigns/pending',
  requireAdminPanel('queue'),
  asyncHandler(async (req: Request, res) => {
    const { page, pageSize, skip } = parsePagination(req.query);
    const where = {
      status: 'PendingReview' as const
    };
    const [total, campaigns] = await Promise.all([
      prisma.campaign.count({ where }),
      prisma.campaign.findMany({
        where,
        include: {
          donations: true,
          creator: {
            select: {
              id: true,
              fullName: true,
              email: true,
              phoneNumber: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        skip,
        take: pageSize
      })
    ]);

    res.json({
      items: await Promise.all(
        campaigns.map(async (c) => {
          const last = await getLastDonationAt(prisma, c.id);
          return {
            ...c,
            daysLeft: computeDaysLeftFromEndsAt(c.endsAt),
            lastDonationAt: last?.toISOString() ?? null,
            inactive60Days: isInactiveForAdminEnd(last, c.createdAt)
          };
        })
      ),
      total,
      page,
      pageSize
    });
  })
);

// Get all campaigns (admin view)
adminRouter.get(
  '/campaigns',
  requireAdminPanel('campaigns'),
  asyncHandler(async (req: Request, res) => {
    const { page, pageSize, skip } = parsePagination(req.query);
    const [total, campaigns] = await Promise.all([
      prisma.campaign.count(),
      prisma.campaign.findMany({
        include: {
          donations: true,
          creator: {
            select: {
              id: true,
              fullName: true,
              email: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        skip,
        take: pageSize
      })
    ]);

    res.json({
      items: await Promise.all(
        campaigns.map(async (c) => {
          const last = await getLastDonationAt(prisma, c.id);
          return {
            ...c,
            daysLeft: computeDaysLeftFromEndsAt(c.endsAt),
            lastDonationAt: last?.toISOString() ?? null,
            inactive60Days:
              c.status === 'Active' && isInactiveForAdminEnd(last, c.createdAt)
          };
        })
      ),
      total,
      page,
      pageSize
    });
  })
);

adminRouter.get(
  '/campaigns/:campaignId/verification-document',
  requireAnyAdminPanel(['queue', 'campaigns']),
  asyncHandler(async (req: AuthRequest, res) => {
    const campaignId = String(req.params.campaignId);
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { verificationDocumentUrl: true }
    });

    if (!campaign?.verificationDocumentUrl) {
      res.status(404).json({ message: 'No verification document for this campaign' });
      return;
    }

    const fsPath = uploadsFsPathFromPublicUrl(campaign.verificationDocumentUrl);
    if (!fsPath) {
      res.status(404).json({ message: 'Invalid document path' });
      return;
    }

    try {
      await fs.access(fsPath);
    } catch {
      res.status(404).json({ message: 'File not found' });
      return;
    }

    res.sendFile(fsPath, { dotfiles: 'deny' });
  })
);

// Approve/reject a campaign
adminRouter.patch(
  '/campaigns/:campaignId/status',
  requireAnyAdminPanel(['queue', 'campaigns']),
  asyncHandler(async (req: AuthRequest, res) => {
    const campaignId = String(req.params.campaignId);
    const body = approveCampaignSchema.parse(req.body);

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId }
    });

    if (!campaign) {
      res.status(404).json({ message: 'Campaign not found' });
      return;
    }

    const previousStatus = campaign.status;

    const updatedCampaign = await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: body.status as CampaignStatus,
        ...(body.status === 'Ended' ? { endedAt: new Date() } : {})
      },
      include: {
        creator: {
          select: {
            id: true,
            fullName: true,
            email: true
          }
        },
        donations: true
      }
    });

    await recordActivity({
      type: 'CAMPAIGN_STATUS_CHANGED',
      title: `Campaign "${updatedCampaign.title}" set to ${body.status}`,
      detail: `Previous status: ${previousStatus}`,
      campaignId: updatedCampaign.id,
      userId: updatedCampaign.creatorId,
      actorId: req.userId ?? null
    });

    const creator = updatedCampaign.creator;
    if (
      creator?.email &&
      (body.status === 'Active' ||
        body.status === 'Rejected' ||
        body.status === 'Closed' ||
        body.status === 'Ended')
    ) {
      await notifyCreatorCampaignDecision({
        to: creator.email,
        title: updatedCampaign.title,
        slug: updatedCampaign.slug,
        status: body.status
      });
    }

    res.json({
      message: `Campaign ${body.status.toLowerCase()}`,
      campaign: {
        ...updatedCampaign,
        daysLeft: computeDaysLeftFromEndsAt(updatedCampaign.endsAt)
      }
    });
  })
);

adminRouter.get(
  '/withdrawal-requests',
  requireAdminPanel('withdrawals'),
  asyncHandler(async (req: Request, res) => {
    const { page, pageSize, skip } = parsePagination(req.query);
    const [total, list] = await Promise.all([
      prisma.withdrawalRequest.count(),
      prisma.withdrawalRequest.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          campaign: {
            select: {
              id: true,
              title: true,
              slug: true,
              raisedAmount: true,
              status: true
            }
          },
          user: {
            select: { id: true, fullName: true, email: true, phoneNumber: true }
          }
        }
      })
    ]);

    res.json({
      items: list.map((w) => ({
        ...w,
        createdAt: w.createdAt.toISOString(),
        updatedAt: w.updatedAt.toISOString(),
        ...serializeWithdrawalPayout(w)
      })),
      total,
      page,
      pageSize
    });
  })
);

const allowedWithdrawalTransitions: Record<
  WithdrawalRequestStatus,
  WithdrawalRequestStatus[]
> = {
  Pending: ['Approved', 'Rejected'],
  Approved: ['Paid', 'Rejected'],
  Rejected: [],
  Paid: []
};

adminRouter.patch(
  '/withdrawal-requests/:requestId',
  requireAdminPanel('withdrawals'),
  asyncHandler(async (req: AuthRequest, res) => {
    const requestId = String(req.params.requestId);
    const body = patchWithdrawalRequestSchema.parse(req.body);

    const existing = await prisma.withdrawalRequest.findUnique({
      where: { id: requestId },
      include: {
        campaign: { select: { title: true, slug: true } },
        user: { select: { email: true, fullName: true } }
      }
    });

    if (!existing) {
      res.status(404).json({ message: 'Withdrawal request not found' });
      return;
    }

    const allowed = allowedWithdrawalTransitions[existing.status];
    if (!allowed.includes(body.status as WithdrawalRequestStatus)) {
      res.status(400).json({
        message: `Cannot change status from ${existing.status} to ${body.status}`
      });
      return;
    }

    if (body.status === 'Paid' && !existing.payoutMethodType) {
      throw new HttpError(
        400,
        'This withdrawal has no payout destination on file. Ask the organizer to submit a new request.'
      );
    }

    const updated = await prisma.withdrawalRequest.update({
      where: { id: requestId },
      data: {
        status: body.status,
        ...(body.adminNote !== undefined ? { adminNote: body.adminNote || null } : {}),
        ...(body.status === 'Paid'
          ? {
              payoutReference: body.payoutReference!.trim(),
              paidAt: new Date(),
              paidByAdminId: req.userId ?? null
            }
          : {})
      },
      include: {
        campaign: {
          select: {
            id: true,
            title: true,
            slug: true,
            raisedAmount: true,
            status: true
          }
        },
        user: {
          select: { id: true, fullName: true, email: true, phoneNumber: true }
        }
      }
    });

    await recordActivity({
      type: 'WITHDRAWAL_STATUS_CHANGED',
      title: `Withdrawal ${body.status}: D${updated.amount.toLocaleString()} — ${updated.campaign.title}`,
      detail: `Organizer: ${existing.user.email}`,
      campaignId: updated.campaignId,
      userId: updated.userId,
      actorId: req.userId ?? null
    });

    if (
      updated.user.email &&
      (body.status === 'Approved' || body.status === 'Rejected' || body.status === 'Paid')
    ) {
      await notifyCreatorWithdrawalStatus({
        to: updated.user.email,
        fullName: updated.user.fullName,
        campaignTitle: updated.campaign.title,
        requestedAmount: updated.amount,
        netAmount: updated.netAmount,
        processingFeeAmount: updated.processingFeeAmount,
        currency: updated.currency,
        status: body.status,
        adminNote: updated.adminNote,
        organizerNote: existing.note,
        payoutMethodType: updated.payoutMethodType,
        payoutLabel: updated.payoutLabel,
        payoutDetails: updated.payoutDetails,
        payoutReference: updated.payoutReference,
        paidAt: updated.paidAt
      });
    }

    if (body.status === 'Paid') {
      await prisma.$transaction(async (tx) => {
        await tryFinalizeCampaignEnded(tx, updated.campaignId);
      });
    }

    res.json({
      ...updated,
      ...serializeWithdrawalPayout(updated)
    });
  })
);

adminRouter.get(
  '/campaigns/extension-requests/pending',
  requireAnyAdminPanel(['queue', 'campaigns']),
  asyncHandler(async (req: Request, res) => {
    const { page, pageSize, skip } = parsePagination(req.query, 20);
    const where = { status: 'Pending' as const };
    const [total, items] = await Promise.all([
      prisma.campaignExtensionRequest.count({ where }),
      prisma.campaignExtensionRequest.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip,
        take: pageSize,
        include: {
          campaign: {
            select: {
              id: true,
              title: true,
              slug: true,
              endsAt: true,
              status: true,
              creatorName: true
            }
          },
          requestedBy: {
            select: { id: true, fullName: true, email: true }
          }
        }
      })
    ]);
    res.json({
      items: items.map((r) => ({
        id: r.id,
        campaignId: r.campaignId,
        campaignTitle: r.campaign.title,
        campaignSlug: r.campaign.slug,
        currentEndsAt: r.campaign.endsAt.toISOString(),
        requestedEndDate: r.requestedEndDate,
        requestedEndsAt: r.requestedEndsAt.toISOString(),
        reason: r.reason,
        status: r.status,
        requestedBy: r.requestedBy,
        createdAt: r.createdAt.toISOString()
      })),
      total,
      page,
      pageSize
    });
  })
);

adminRouter.patch(
  '/campaigns/extension-requests/:requestId',
  requireAnyAdminPanel(['queue', 'campaigns']),
  asyncHandler(async (req: AuthRequest, res) => {
    const requestId = String(req.params.requestId);
    const body = reviewExtensionSchema.parse(req.body);

    const existing = await prisma.campaignExtensionRequest.findUnique({
      where: { id: requestId },
      include: { campaign: true }
    });

    if (!existing) {
      res.status(404).json({ message: 'Extension request not found' });
      return;
    }

    if (existing.status !== 'Pending') {
      res.status(400).json({ message: 'This extension request has already been reviewed' });
      return;
    }

    if (body.status === 'Approved') {
      if (existing.campaign.status !== 'Active') {
        res.status(400).json({ message: 'Only active campaigns can receive an extension' });
        return;
      }
      if (existing.requestedEndsAt.getTime() <= existing.campaign.endsAt.getTime()) {
        res.status(400).json({ message: 'Requested end date is not after the current end date' });
        return;
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.campaignExtensionRequest.update({
        where: { id: requestId },
        data: {
          status: body.status,
          reviewedById: req.userId ?? null,
          reviewedAt: new Date(),
          adminNote: body.adminNote?.trim() || null
        },
        include: { campaign: true, requestedBy: { select: { email: true, fullName: true } } }
      });

      if (body.status === 'Approved') {
        const daysLeft = computeDaysLeftFromEndsAt(existing.requestedEndsAt);
        await tx.campaign.update({
          where: { id: existing.campaignId },
          data: {
            endsAt: existing.requestedEndsAt,
            daysLeft
          }
        });
      }

      return row;
    });

    await recordActivity({
      type: 'CAMPAIGN_EXTENSION_REVIEWED',
      title: `Extension ${body.status.toLowerCase()}: ${updated.campaign.title}`,
      detail: `New end: ${existing.requestedEndDate}`,
      campaignId: updated.campaignId,
      userId: updated.campaign.creatorId,
      actorId: req.userId ?? null
    });

    res.json({
      message: `Extension request ${body.status.toLowerCase()}`,
      request: {
        id: updated.id,
        status: updated.status,
        adminNote: updated.adminNote,
        reviewedAt: updated.reviewedAt?.toISOString() ?? null
      }
    });
  })
);

adminRouter.post(
  '/campaigns/:campaignId/end-inactive',
  requireAnyAdminPanel(['queue', 'campaigns']),
  asyncHandler(async (req: AuthRequest, res) => {
    const campaignId = String(req.params.campaignId);
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });

    if (!campaign) {
      res.status(404).json({ message: 'Campaign not found' });
      return;
    }

    if (campaign.status !== 'Active') {
      res.status(400).json({
        message: 'Only active campaigns can be ended for inactivity'
      });
      return;
    }

    const lastDonationAt = await getLastDonationAt(prisma, campaignId);
    if (!isInactiveForAdminEnd(lastDonationAt, campaign.createdAt)) {
      res.status(400).json({
        message: `Campaign is not inactive for ${60} days since the last donation`
      });
      return;
    }

    const updated = await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: 'Ended',
        endedAt: new Date()
      },
      include: { donations: { take: 1 } }
    });

    await recordActivity({
      type: 'CAMPAIGN_ENDED_INACTIVE',
      title: `Campaign ended (60+ days inactive): ${updated.title}`,
      detail: lastDonationAt
        ? `Last donation: ${lastDonationAt.toISOString()}`
        : 'No donations recorded',
      campaignId: updated.id,
      userId: updated.creatorId,
      actorId: req.userId ?? null
    });

    res.json({
      message: 'Campaign marked as ended due to inactivity',
      campaign: {
        id: updated.id,
        slug: updated.slug,
        status: updated.status,
        endedAt: updated.endedAt?.toISOString() ?? null
      }
    });
  })
);

// Get all users
adminRouter.get(
  '/users',
  requireAdminPanel('users'),
  asyncHandler(async (req: Request, res) => {
    const { page, pageSize, skip } = parsePagination(req.query);
    const [total, users] = await Promise.all([
      prisma.user.count(),
      prisma.user.findMany({
        select: {
          id: true,
          email: true,
          fullName: true,
          phoneNumber: true,
          role: true,
          isActive: true,
          createdAt: true,
          _count: {
            select: {
              campaigns: true,
              donations: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        skip,
        take: pageSize
      })
    ]);

    res.json({ items: users, total, page, pageSize });
  })
);

// Deactivate/activate user
adminRouter.patch(
  '/users/:userId/status',
  requireAdminPanel('users'),
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = String(req.params.userId);
    const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);

    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    if (user.id === req.userId && !isActive) {
      res.status(400).json({ message: 'Cannot deactivate your own account' });
      return;
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { isActive },
      select: {
        id: true,
        email: true,
        fullName: true,
        isActive: true,
        role: true
      }
    });

    await recordActivity({
      type: 'USER_STATUS_CHANGED',
      title: `User ${updatedUser.email} ${isActive ? 'activated' : 'deactivated'}`,
      detail: `Role: ${updatedUser.role}`,
      userId: updatedUser.id,
      actorId: req.userId ?? null
    });

    res.json({
      message: `User ${isActive ? 'activated' : 'deactivated'}`,
      user: updatedUser
    });
  })
);

// Get dashboard statistics
adminRouter.get(
  '/stats',
  requireAdminPanel('overview'),
  asyncHandler(async (_req, res) => {
    const [
      totalCampaigns,
      activeCampaigns,
      pendingCampaigns,
      totalUsers,
      adminCount,
      totalDonations,
      donationFeeSum,
      withdrawalFeePaidSum
    ] = await Promise.all([
      prisma.campaign.count(),
      prisma.campaign.count({ where: { status: 'Active' } }),
      prisma.campaign.count({ where: { status: 'PendingReview' } }),
      prisma.user.count(),
      prisma.user.count({ where: { role: 'ADMIN' } }),
      prisma.donation.count(),
      prisma.donation.aggregate({ _sum: { platformFeeAmount: true } }),
      prisma.withdrawalRequest.aggregate({
        where: { status: 'Paid' },
        _sum: { processingFeeAmount: true }
      })
    ]);

    const stats = await prisma.platformStat.findUnique({
      where: { id: 'platform' }
    });

    res.json({
      campaigns: {
        total: totalCampaigns,
        active: activeCampaigns,
        pending: pendingCampaigns
      },
      users: {
        total: totalUsers,
        admins: adminCount
      },
      donations: totalDonations,
      platformStats: stats,
      fees: {
        /** Sum of 1.9% donation fees (all recorded donations). */
        totalDonationPlatformFees: donationFeeSum._sum.platformFeeAmount ?? 0,
        /** Sum of 3% withdrawal processing fees for payouts marked Paid. */
        totalWithdrawalProcessingFees: withdrawalFeePaidSum._sum.processingFeeAmount ?? 0
      }
    });
  })
);

const createAdminAccountSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  fullName: z.string().min(2),
  phoneNumber: z.string().max(30).optional(),
  /** Empty = full admin panel; otherwise only these areas. */
  adminPanelPermissions: z.array(z.string()).default([])
});

const patchAdminPermissionsSchema = z.object({
  adminPanelPermissions: z.array(z.string())
});

adminRouter.get(
  '/accounts',
  requireAdminPanel('admins'),
  asyncHandler(async (_req, res) => {
    const rows = await prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: {
        id: true,
        email: true,
        fullName: true,
        phoneNumber: true,
        isActive: true,
        adminPanelPermissions: true,
        createdAt: true
      },
      orderBy: { createdAt: 'asc' }
    });
    res.json(
      rows.map((r) => ({
        ...r,
        accessScope: r.adminPanelPermissions.length === 0 ? 'full' : 'limited'
      }))
    );
  })
);

adminRouter.post(
  '/accounts',
  requireAdminPanel('admins'),
  asyncHandler(async (req: AuthRequest, res) => {
    const body = createAdminAccountSchema.parse(req.body);
    assertCanAssignPermissions(body.adminPanelPermissions);

    const existing = await prisma.user.findFirst({
      where: { email: { equals: body.email.trim(), mode: 'insensitive' } }
    });
    if (existing) {
      res.status(409).json({ message: 'An account with this email already exists' });
      return;
    }

    const passwordHash = await hashPassword(body.password);
    const created = await prisma.user.create({
      data: {
        email: body.email.trim(),
        fullName: body.fullName,
        phoneNumber: body.phoneNumber?.trim() || null,
        password: passwordHash,
        role: 'ADMIN',
        adminPanelPermissions: body.adminPanelPermissions
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        phoneNumber: true,
        role: true,
        adminPanelPermissions: true
      }
    });

    await recordActivity({
      type: 'ADMIN_ACCOUNT_CREATED',
      title: `New admin: ${created.email}`,
      detail: `Permissions: ${
        created.adminPanelPermissions.length ? created.adminPanelPermissions.join(',') : 'full'
      }`,
      userId: created.id,
      actorId: req.userId ?? null
    });

    res.status(201).json(created);
  })
);

adminRouter.patch(
  '/accounts/:userId/permissions',
  requireAdminPanel('admins'),
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = String(req.params.userId);
    const body = patchAdminPermissionsSchema.parse(req.body);
    assertCanAssignPermissions(body.adminPanelPermissions);

    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) {
      res.status(404).json({ message: 'User not found' });
      return;
    }
    if (target.role !== 'ADMIN') {
      res.status(400).json({ message: 'User is not an admin' });
      return;
    }

    const wasManaging = canManageAdminsList(target.adminPanelPermissions);
    const willManage = canManageAdminsList(body.adminPanelPermissions);
    if (wasManaging && !willManage) {
      const others = await otherAdminsWhoCanManageAdmins(userId);
      if (others < 1) {
        res.status(400).json({
          message:
            'At least one other admin must keep the “Admins” permission (or full access) before you can remove it here.'
        });
        return;
      }
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { adminPanelPermissions: body.adminPanelPermissions },
      select: {
        id: true,
        email: true,
        fullName: true,
        adminPanelPermissions: true
      }
    });

    await recordActivity({
      type: 'ADMIN_PERMISSIONS_CHANGED',
      title: `Admin permissions: ${updated.email}`,
      detail: `Keys: ${
        updated.adminPanelPermissions.length ? updated.adminPanelPermissions.join(',') : 'full'
      }`,
      userId: updated.id,
      actorId: req.userId ?? null
    });

    res.json(updated);
  })
);

const easypayProvisionBodySchema = z.object({
  /** Stable id in your app (e.g. admin user id or org key) — replays with same id are idempotent on Easypay. */
  externalUserId: z.string().min(1).max(128),
  ownerEmail: z.string().email(),
  ownerName: z.string().min(1).max(120),
  businessName: z.string().min(1).max(200),
  slug: z.string().min(1).max(80).optional(),
  industry: z.string().max(80).optional(),
  /** Per-business webhook override (HTTPS). Omit to use Easypay default INTERNAL_PARTNER_WEBHOOK_URL. */
  webhookUrl: z.string().url().optional().nullable()
});

/**
 * POST /api/admin/easypay/provision — create (or replay) an Easypay tenant via internal-partner API.
 * Requires EASYPAY_API_BASE_URL + INTERNAL_PARTNER_API_SECRET only. Copy returned `businessId` into
 * EASYPAY_PARTNER_BUSINESS_ID for platform checkout, or store per-organizer if you move to multi-tenant.
 */
adminRouter.post(
  '/easypay/provision',
  asyncHandler(async (req: AuthRequest, res) => {
    if (!getEasypayPartnerApiCredentialsOk()) {
      res.status(503).json({
        message: 'Set EASYPAY_API_BASE_URL and INTERNAL_PARTNER_API_SECRET to provision tenants.'
      });
      return;
    }

    const body = easypayProvisionBodySchema.parse(req.body);
    const data = await provisionEasypayTenant({
      externalUserId: body.externalUserId,
      ownerEmail: body.ownerEmail,
      ownerName: body.ownerName,
      businessName: body.businessName,
      slug: body.slug,
      industry: body.industry,
      webhookUrl: body.webhookUrl ?? undefined
    });

    await recordActivity({
      type: 'EASYPAY_PROVISION',
      title: `Easypay tenant provisioned: ${body.businessName}`,
      detail: `businessId=${data.businessId} slug=${data.slug} idempotentReplay=${data.idempotentReplay}`,
      actorId: req.userId ?? null
    });

    res.status(data.idempotentReplay ? 200 : 201).json({
      message:
        'Copy data.businessId into server EASYPAY_PARTNER_BUSINESS_ID (or your DB) so checkout uses this tenant.',
      data
    });
  })
);

const platformBankAccountBodySchema = z.object({
  label: z.string().max(120).optional().nullable(),
  accountName: z.string().min(1).max(200),
  bankName: z.string().min(1).max(200),
  accountNumber: z.string().min(1).max(80),
  swiftCode: z.string().min(1).max(40),
  bban: z.string().min(1).max(80),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional()
});

adminRouter.get(
  '/platform-bank-accounts',
  requireAdminPanel('bank'),
  asyncHandler(async (_req, res) => {
    const rows = await prisma.platformBankAccount.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
    });
    res.json(rows.map(serializePlatformBankAccount));
  })
);

adminRouter.post(
  '/platform-bank-accounts',
  requireAdminPanel('bank'),
  asyncHandler(async (req, res) => {
    const body = platformBankAccountBodySchema.parse(req.body);
    const row = await prisma.platformBankAccount.create({
      data: {
        label: body.label?.trim() || null,
        accountName: body.accountName.trim(),
        bankName: body.bankName.trim(),
        accountNumber: body.accountNumber.trim(),
        swiftCode: body.swiftCode.trim(),
        bban: body.bban.trim(),
        isActive: body.isActive ?? true,
        sortOrder: body.sortOrder ?? 0
      }
    });
    res.status(201).json(serializePlatformBankAccount(row));
  })
);

adminRouter.patch(
  '/platform-bank-accounts/:accountId',
  requireAdminPanel('bank'),
  asyncHandler(async (req, res) => {
    const accountId = String(req.params.accountId);
    const body = platformBankAccountBodySchema.partial().parse(req.body);
    const existing = await prisma.platformBankAccount.findUnique({ where: { id: accountId } });
    if (!existing) {
      res.status(404).json({ message: 'Bank account not found' });
      return;
    }
    const row = await prisma.platformBankAccount.update({
      where: { id: accountId },
      data: {
        ...(body.label !== undefined ? { label: body.label?.trim() || null } : {}),
        ...(body.accountName !== undefined ? { accountName: body.accountName.trim() } : {}),
        ...(body.bankName !== undefined ? { bankName: body.bankName.trim() } : {}),
        ...(body.accountNumber !== undefined ? { accountNumber: body.accountNumber.trim() } : {}),
        ...(body.swiftCode !== undefined ? { swiftCode: body.swiftCode.trim() } : {}),
        ...(body.bban !== undefined ? { bban: body.bban.trim() } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {})
      }
    });
    res.json(serializePlatformBankAccount(row));
  })
);

adminRouter.get(
  '/bank-transfers',
  requireAdminPanel('bank'),
  asyncHandler(async (req, res) => {
    await expireStaleBankTransferIntents();
    const { page, pageSize, skip } = parsePagination(req.query);
    const statusFilter = z
      .enum(['Pending', 'Confirmed', 'Rejected', 'Expired'])
      .optional()
      .parse(req.query.status);
    const where = statusFilter ? { status: statusFilter } : {};
    const [total, items] = await Promise.all([
      prisma.bankTransferIntent.count({ where }),
      prisma.bankTransferIntent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          campaign: { select: { title: true, slug: true } },
          platformBankAccount: true,
          user: { select: { email: true, fullName: true } }
        }
      })
    ]);
    res.json({
      items: items.map(serializeBankTransferIntent),
      total,
      page,
      pageSize
    });
  })
);

const confirmBankTransferSchema = z.object({
  receivedAmount: z.number().int().min(1),
  adminNote: z.string().max(2000).optional().nullable()
});

const rejectBankTransferSchema = z.object({
  adminNote: z.string().max(2000).optional().nullable()
});

adminRouter.post(
  '/bank-transfers/:intentId/confirm',
  requireAdminPanel('bank'),
  asyncHandler(async (req: AuthRequest, res) => {
    const intentId = String(req.params.intentId);
    const body = confirmBankTransferSchema.parse(req.body);

    const intent = await prisma.bankTransferIntent.findUnique({
      where: { id: intentId },
      include: {
        campaign: { select: { title: true, slug: true } },
        user: { select: { email: true, fullName: true } }
      }
    });

    if (!intent) {
      res.status(404).json({ message: 'Bank transfer not found' });
      return;
    }

    try {
      const { updated, donation } = await confirmBankTransferIntent({
        intent,
        receivedAmount: body.receivedAmount,
        reviewedById: req.userId ?? null,
        adminNote: body.adminNote
      });

      await recordActivity({
        type: 'BANK_TRANSFER_CONFIRMED',
        title: `Bank transfer confirmed: ${intent.clientReference} — D${body.receivedAmount}`,
        detail: intent.campaign.title,
        campaignId: intent.campaignId,
        actorId: req.userId ?? null
      });

      await sendBankTransferConfirmedEmails(updated, donation.amount);

      res.json(serializeBankTransferIntent(updated));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not confirm transfer';
      res.status(400).json({ message });
    }
  })
);

adminRouter.post(
  '/bank-transfers/:intentId/reject',
  requireAdminPanel('bank'),
  asyncHandler(async (req: AuthRequest, res) => {
    const intentId = String(req.params.intentId);
    const body = rejectBankTransferSchema.parse(req.body);

    const intent = await prisma.bankTransferIntent.findUnique({
      where: { id: intentId },
      include: {
        campaign: { select: { title: true, slug: true } },
        user: { select: { email: true, fullName: true } }
      }
    });

    if (!intent) {
      res.status(404).json({ message: 'Bank transfer not found' });
      return;
    }

    if (intent.status !== 'Pending') {
      res.status(400).json({ message: `Cannot reject transfer in status ${intent.status}` });
      return;
    }

    const updated = await prisma.bankTransferIntent.update({
      where: { id: intentId },
      data: {
        status: 'Rejected',
        reviewedById: req.userId ?? null,
        reviewedAt: new Date(),
        adminNote: body.adminNote?.trim() || null
      },
      include: {
        campaign: { select: { title: true, slug: true } },
        platformBankAccount: true,
        user: { select: { email: true, fullName: true } }
      }
    });

    await recordActivity({
      type: 'BANK_TRANSFER_REJECTED',
      title: `Bank transfer rejected: ${intent.clientReference}`,
      detail: intent.campaign.title,
      campaignId: intent.campaignId,
      actorId: req.userId ?? null
    });

    if (updated.user?.email) {
      void sendBankTransferRejectedEmail({
        to: updated.user.email,
        donorName: updated.donorName,
        campaignTitle: updated.campaign.title,
        clientReference: updated.clientReference,
        adminNote: updated.adminNote
      });
    }

    res.json(serializeBankTransferIntent(updated));
  })
);

export { adminRouter };
