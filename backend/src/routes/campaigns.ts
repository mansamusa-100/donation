import { Router } from 'express';
import { Category, Currency, Prisma } from '@prisma/client';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import { prisma } from '../lib/prisma.js';
import { serializeCampaign, serializeDonation } from '../lib/serializers.js';
import { authenticate, optionalAuthenticate, AuthRequest } from '../lib/auth.js';
import { recordActivity } from '../lib/activityLog.js';
import {
  notifyAdminsCampaignSubmitted,
  sendCampaignCreatedConfirmation,
  sendDonationThankYouEmail,
  sendWithdrawalRequestReceivedEmail
} from '../lib/mail.js';
import {
  withdrawalNetToOrganizer,
  withdrawalProcessingFeeFromGross
} from '../config/fees.js';
import { MAX_PLATFORM_TIP_PER_CHECKOUT } from '../config/platformTip.js';
import { applyDonationToLedger, recordPlatformTip } from '../lib/processDonationLedger.js';
import { HttpError } from '../lib/HttpError.js';

const campaignQuerySchema = z.object({
  search: z.string().trim().optional(),
  category: z.nativeEnum(Category).optional(),
  sort: z.enum(['trending', 'newest', 'funded']).optional()
});

const coverImageSchema = z.string().refine(
  (s) => {
    if (s.startsWith('/uploads/campaign-covers/')) {
      return true;
    }
    try {
      const u = new URL(s);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  },
  { message: 'Cover must be a valid image URL or an uploaded file path' }
);

const createCampaignSchema = z.object({
  title: z.string().min(5).max(120),
  creatorName: z.string().min(2).max(80),
  creatorAvatar: z.string().url().optional(),
  category: z.nativeEnum(Category),
  shortDescription: z.string().min(20).max(240),
  fullDescription: z.string().min(40),
  goalAmount: z.number().int().positive(),
  daysLeft: z.number().int().positive().max(365),
  coverImage: coverImageSchema,
  verificationDocumentUrl: z
    .string()
    .min(1)
    .refine((s) => s.startsWith('/uploads/verification-ids/'), {
      message: 'ID verification document must be uploaded'
    }),
  termsAcceptedAt: z.string().datetime()
});

const createDonationSchema = z.object({
  /** Optional when authenticated; server uses account full name if missing (non-anonymous). */
  donorName: z.string().max(80).optional(),
  amount: z.number().int().positive(),
  /** Voluntary platform tip (same currency), recorded separately from the campaign donation. */
  platformTipAmount: z
    .number()
    .int()
    .min(0)
    .max(MAX_PLATFORM_TIP_PER_CHECKOUT)
    .optional()
    .default(0),
  currency: z.nativeEnum(Currency).default('GMD'),
  message: z.string().max(280).optional(),
  isAnonymous: z.boolean().default(false),
  avatarUrl: z.string().url().optional()
});

const createWithdrawalRequestSchema = z.object({
  campaignSlug: z.string().min(1),
  amount: z.number().int().positive(),
  note: z.string().max(500).optional()
});

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function ensureUniqueSlug(baseTitle: string) {
  const baseSlug = slugify(baseTitle);
  let candidate = baseSlug;
  let suffix = 1;

  while (await prisma.campaign.findUnique({ where: { slug: candidate } })) {
    suffix += 1;
    candidate = `${baseSlug}-${suffix}`;
  }

  return candidate;
}

export const campaignsRouter = Router();

campaignsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = campaignQuerySchema.parse(req.query);

    const campaigns = await prisma.campaign.findMany({
      where: {
        status: 'Active',
        ...(query.category ? { category: query.category } : {}),
        ...(query.search
          ? {
              OR: [
                {
                  title: {
                    contains: query.search,
                    mode: 'insensitive'
                  }
                },
                {
                  shortDescription: {
                    contains: query.search,
                    mode: 'insensitive'
                  }
                }
              ]
            }
          : {})
      },
      orderBy:
        query.sort === 'funded'
          ? [{ raisedAmount: 'desc' }]
          : query.sort === 'newest'
            ? [{ createdAt: 'desc' }]
            : [{ isTrending: 'desc' }, { createdAt: 'desc' }],
      include: {
        donations: {
          orderBy: { createdAt: 'desc' },
          take: 5
        }
      }
    });

    res.json(campaigns.map(serializeCampaign));
  })
);

campaignsRouter.get(
  '/mine/overview',
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    const campaigns = await prisma.campaign.findMany({
      where: { creatorId: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        donations: {
          orderBy: { createdAt: 'desc' },
          take: 5
        }
      }
    });

    const recentDonations = await prisma.donation.findMany({
      where: { campaign: { creatorId: userId } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        campaign: {
          select: { title: true, slug: true }
        }
      }
    });

    const donationsMade = await prisma.donation.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        campaign: {
          select: { title: true, slug: true }
        }
      }
    });

    const totals = {
      totalRaised: campaigns.reduce((sum, c) => sum + c.raisedAmount, 0),
      totalDonors: campaigns.reduce((sum, c) => sum + c.donorCount, 0),
      totalGiven: donationsMade.reduce((sum, d) => sum + d.amount, 0)
    };

    const campaignIds = campaigns.map((c) => c.id);
    const committedByCampaign =
      campaignIds.length === 0
        ? []
        : await prisma.withdrawalRequest.groupBy({
            by: ['campaignId'],
            where: {
              campaignId: { in: campaignIds },
              status: { in: ['Pending', 'Approved', 'Paid'] }
            },
            _sum: { amount: true }
          });

    const committedMap = Object.fromEntries(
      committedByCampaign.map((row) => [row.campaignId, row._sum.amount ?? 0])
    );

    const withdrawalRows = await prisma.withdrawalRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        campaign: { select: { title: true, slug: true } }
      }
    });

    res.json({
      campaigns: campaigns.map((c) => ({
        ...serializeCampaign(c),
        availableForWithdrawal: Math.max(
          0,
          c.raisedAmount - (committedMap[c.id] ?? 0)
        )
      })),
      withdrawalRequests: withdrawalRows.map((w) => ({
        id: w.id,
        campaignId: w.campaignId,
        campaignTitle: w.campaign.title,
        campaignSlug: w.campaign.slug,
        amount: w.amount,
        processingFeeAmount: w.processingFeeAmount,
        netAmount: w.netAmount,
        currency: w.currency,
        status: w.status,
        note: w.note,
        createdAt: w.createdAt.toISOString(),
        updatedAt: w.updatedAt.toISOString()
      })),
      recentDonations: recentDonations.map((d) => ({
        id: d.id,
        name: d.donorName,
        amount: d.amount,
        currency: d.currency,
        timeAgo: serializeDonation(d).timeAgo,
        campaignTitle: d.campaign.title,
        campaignSlug: d.campaign.slug
      })),
      donationsMade: donationsMade.map((d) => ({
        id: d.id,
        name: d.donorName,
        amount: d.amount,
        currency: d.currency,
        timeAgo: serializeDonation(d).timeAgo,
        campaignTitle: d.campaign.title,
        campaignSlug: d.campaign.slug
      })),
      totals
    });
  })
);

campaignsRouter.post(
  '/withdrawal-requests',
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    const body = createWithdrawalRequestSchema.parse(req.body);

    const wr = await prisma.$transaction(
      async (tx) => {
        const campaign = await tx.campaign.findUnique({
          where: { slug: body.campaignSlug }
        });

        if (!campaign) {
          throw new HttpError(404, 'Campaign not found');
        }

        if (campaign.creatorId !== userId) {
          throw new HttpError(
            403,
            'Only the campaign organizer can request a withdrawal'
          );
        }

        if (campaign.status !== 'Active' && campaign.status !== 'Closed') {
          throw new HttpError(
            400,
            'Withdrawals are only available for campaigns that are active or closed'
          );
        }

        const agg = await tx.withdrawalRequest.aggregate({
          where: {
            campaignId: campaign.id,
            status: { in: ['Pending', 'Approved', 'Paid'] }
          },
          _sum: { amount: true }
        });

        const committed = agg._sum.amount ?? 0;
        const available = Math.max(0, campaign.raisedAmount - committed);

        if (body.amount > available) {
          throw new HttpError(
            400,
            `Amount exceeds available balance (D${available.toLocaleString()} available)`
          );
        }

        const processingFeeAmount = withdrawalProcessingFeeFromGross(body.amount);
        const netAmount = withdrawalNetToOrganizer(body.amount);

        return tx.withdrawalRequest.create({
          data: {
            campaignId: campaign.id,
            userId,
            amount: body.amount,
            processingFeeAmount,
            netAmount,
            currency: 'GMD',
            note: body.note?.trim() || null,
            status: 'Pending'
          },
          include: {
            campaign: { select: { title: true, slug: true } },
            user: { select: { email: true, fullName: true } }
          }
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      }
    );

    if (wr.user?.email) {
      void sendWithdrawalRequestReceivedEmail({
        to: wr.user.email,
        fullName: wr.user.fullName,
        campaignTitle: wr.campaign.title,
        requestedAmount: wr.amount,
        netAmount: wr.netAmount,
        processingFeeAmount: wr.processingFeeAmount
      });
    }

    await recordActivity({
      type: 'WITHDRAWAL_REQUESTED',
      title: `Withdrawal requested: D${wr.amount.toLocaleString()} (net D${wr.netAmount.toLocaleString()}) — ${wr.campaign.title}`,
      detail: `Campaign slug: ${body.campaignSlug}`,
      campaignId: wr.campaignId,
      userId,
      actorId: userId
    });

    res.status(201).json({
      id: wr.id,
      campaignId: wr.campaignId,
      campaignTitle: wr.campaign.title,
      campaignSlug: wr.campaign.slug,
      amount: wr.amount,
      processingFeeAmount: wr.processingFeeAmount,
      netAmount: wr.netAmount,
      currency: wr.currency,
      status: wr.status,
      note: wr.note,
      createdAt: wr.createdAt.toISOString(),
      updatedAt: wr.updatedAt.toISOString()
    });
  })
);

campaignsRouter.get(
  '/:slug',
  asyncHandler(async (req, res) => {
    const campaign = await prisma.campaign.findUnique({
      where: { slug: String(req.params.slug) },
      include: {
        donations: {
          orderBy: { createdAt: 'desc' },
          take: 10
        }
      }
    });

    if (!campaign) {
      res.status(404).json({ message: 'Campaign not found' });
      return;
    }

    if (campaign.status !== 'Active') {
      res.status(404).json({ message: 'Campaign not found' });
      return;
    }

    res.json(serializeCampaign(campaign));
  })
);

campaignsRouter.post(
  '/',
  optionalAuthenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    if (req.userRole === 'ADMIN') {
      res.status(403).json({
        message:
          'Administrator accounts cannot create fundraising campaigns. Review and approve campaigns from the admin panel instead.'
      });
      return;
    }

    const body = createCampaignSchema.parse(req.body);
    const slug = await ensureUniqueSlug(body.title);

    const campaign = await prisma.campaign.create({
      data: {
        slug,
        title: body.title,
        creatorName: body.creatorName,
        creatorAvatar:
          body.creatorAvatar ??
          'https://images.unsplash.com/photo-1527980965255-d3b416303d12?w=150&h=150&fit=crop&q=80',
        category: body.category,
        shortDescription: body.shortDescription,
        fullDescription: body.fullDescription,
        goalAmount: body.goalAmount,
        daysLeft: body.daysLeft,
        coverImage: body.coverImage,
        verificationDocumentUrl: body.verificationDocumentUrl,
        termsAcceptedAt: new Date(body.termsAcceptedAt),
        status: 'PendingReview',
        creatorId: req.userId || undefined
      },
      include: {
        donations: true
      }
    });

    let creatorLabel = body.creatorName;
    if (req.userId) {
      const u = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { email: true, fullName: true }
      });
      if (u) {
        creatorLabel = `${u.fullName} (${u.email})`;
      }
    } else {
      creatorLabel = `${body.creatorName} (no account — submitted as guest)`;
    }

    await recordActivity({
      type: 'CAMPAIGN_SUBMITTED',
      title: `New campaign pending review: ${campaign.title}`,
      detail: `Slug: ${campaign.slug} · ${creatorLabel}`,
      campaignId: campaign.id,
      userId: campaign.creatorId ?? null,
      actorId: req.userId ?? null
    });

    await notifyAdminsCampaignSubmitted({
      title: campaign.title,
      slug: campaign.slug,
      creatorLabel
    });

    if (req.userId) {
      const creator = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { email: true, fullName: true }
      });
      if (creator?.email) {
        void sendCampaignCreatedConfirmation({
          to: creator.email,
          fullName: creator.fullName,
          campaignTitle: campaign.title,
          campaignSlug: campaign.slug
        });
      }
    }

    res.status(201).json(serializeCampaign(campaign));
  })
);

campaignsRouter.post(
  '/:slug/donations',
  optionalAuthenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const body = createDonationSchema.parse(req.body);

    const campaign = await prisma.campaign.findUnique({
      where: { slug: String(req.params.slug) }
    });

    if (!campaign) {
      res.status(404).json({ message: 'Campaign not found' });
      return;
    }

    if (campaign.status !== 'Active') {
      res.status(400).json({
        message: 'This campaign is not accepting donations. Only active campaigns can receive donations.'
      });
      return;
    }

    let donorDisplayName: string;
    if (body.isAnonymous) {
      donorDisplayName = 'Anonymous';
    } else {
      const fromForm = body.donorName?.trim() ?? '';
      if (fromForm.length >= 2) {
        donorDisplayName = fromForm;
      } else if (req.userId) {
        const account = await prisma.user.findUnique({
          where: { id: req.userId },
          select: { fullName: true, isActive: true }
        });
        if (!account?.isActive) {
          res.status(401).json({ message: 'Account is inactive' });
          return;
        }
        const fromProfile = account.fullName?.trim() ?? '';
        if (fromProfile.length < 2) {
          res.status(400).json({
            message: 'Please enter your name on the form, or update your profile name.'
          });
          return;
        }
        donorDisplayName = fromProfile;
      } else {
        res.status(400).json({ message: 'Please enter your name or mark the donation as anonymous' });
        return;
      }
    }

    const donationUserId = !body.isAnonymous && req.userId ? req.userId : undefined;

    const platformTip = body.platformTipAmount ?? 0;

    await prisma.$transaction(async (tx) => {
      await applyDonationToLedger(tx, {
        campaignId: campaign.id,
        campaignSlug: String(req.params.slug),
        userId: donationUserId,
        donorName: donorDisplayName,
        amount: body.amount,
        currency: body.currency,
        message: body.message,
        isAnonymous: body.isAnonymous,
        avatarUrl: body.avatarUrl
      });
      if (platformTip > 0) {
        await recordPlatformTip(tx, {
          amount: platformTip,
          currency: body.currency,
          donorName: donorDisplayName,
          userId: donationUserId ?? null,
          campaignId: campaign.id,
          wavePaymentIntentId: null
        });
      }
    });

    if (donationUserId) {
      const donorUser = await prisma.user.findUnique({
        where: { id: donationUserId },
        select: { email: true }
      });
      if (donorUser?.email) {
        void sendDonationThankYouEmail({
          to: donorUser.email,
          donorName: donorDisplayName,
          amount: body.amount,
          currency: body.currency,
          campaignTitle: campaign.title,
          campaignSlug: campaign.slug,
          platformTipAmount: platformTip
        });
      }
    }

    const updatedCampaign = await prisma.campaign.findUnique({
      where: { id: campaign.id },
      include: {
        donations: {
          orderBy: { createdAt: 'desc' },
          take: 10
        }
      }
    });

    res.status(201).json(
      updatedCampaign ? serializeCampaign(updatedCampaign) : null
    );
  })
);
