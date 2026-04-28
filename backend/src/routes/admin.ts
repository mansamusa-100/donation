import { Router, type Request } from 'express';
import fs from 'node:fs/promises';
import { z } from 'zod';
import { CampaignStatus, WithdrawalRequestStatus } from '@prisma/client';
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
import { assertCanAssignPermissions } from '../config/adminPermissions.js';

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
  status: z.enum(['Active', 'Rejected', 'Closed'])
});

const patchWithdrawalRequestSchema = z.object({
  status: z.enum(['Approved', 'Rejected', 'Paid']),
  adminNote: z.string().max(500).optional()
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

    res.json({ items: campaigns, total, page, pageSize });
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

    res.json({ items: campaigns, total, page, pageSize });
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
        status: body.status as CampaignStatus
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
      (body.status === 'Active' || body.status === 'Rejected' || body.status === 'Closed')
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
      campaign: updatedCampaign
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

    res.json({ items: list, total, page, pageSize });
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
        user: { select: { email: true } }
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

    const updated = await prisma.withdrawalRequest.update({
      where: { id: requestId },
      data: {
        status: body.status,
        ...(body.adminNote !== undefined ? { adminNote: body.adminNote || null } : {})
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
        campaignTitle: updated.campaign.title,
        requestedAmount: updated.amount,
        netAmount: updated.netAmount,
        processingFeeAmount: updated.processingFeeAmount,
        status: body.status
      });
    }

    res.json(updated);
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

export { adminRouter };
