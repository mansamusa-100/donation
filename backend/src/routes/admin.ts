import { Router } from 'express';
import fs from 'node:fs/promises';
import { z } from 'zod';
import { CampaignStatus, WithdrawalRequestStatus } from '@prisma/client';
import { asyncHandler } from '../lib/asyncHandler.js';
import { prisma } from '../lib/prisma.js';
import { uploadsFsPathFromPublicUrl } from '../lib/uploadPaths.js';
import { authenticate, requireAdmin, AuthRequest } from '../lib/auth.js';
import { recordActivity } from '../lib/activityLog.js';
import { notifyCreatorCampaignDecision, notifyCreatorWithdrawalStatus } from '../lib/mail.js';

const adminRouter = Router();

// Apply authentication to all admin routes
adminRouter.use(authenticate);
adminRouter.use(requireAdmin);

adminRouter.get(
  '/activity',
  asyncHandler(async (_req, res) => {
    const items = await prisma.activityLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 80
    });
    res.json(items);
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
  asyncHandler(async (_req, res) => {
    const campaigns = await prisma.campaign.findMany({
      where: {
        status: 'PendingReview'
      },
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
      }
    });

    res.json(campaigns);
  })
);

// Get all campaigns (admin view)
adminRouter.get(
  '/campaigns',
  asyncHandler(async (_req, res) => {
    const campaigns = await prisma.campaign.findMany({
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
      }
    });

    res.json(campaigns);
  })
);

adminRouter.get(
  '/campaigns/:campaignId/verification-document',
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
  asyncHandler(async (_req, res) => {
    const list = await prisma.withdrawalRequest.findMany({
      orderBy: { createdAt: 'desc' },
      take: 150,
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

    res.json(list);
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
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
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
      }
    });

    res.json(users);
  })
);

// Deactivate/activate user
adminRouter.patch(
  '/users/:userId/status',
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

export { adminRouter };
