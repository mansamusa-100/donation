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
  sendWithdrawalRequestReceivedEmail,
  notifyAdminsWithdrawalRequested
} from '../lib/mail.js';
import {
  withdrawalNetToOrganizer,
  withdrawalProcessingFeeFromGross
} from '../config/fees.js';
import { MAX_PLATFORM_TIP_PER_CHECKOUT } from '../config/platformTip.js';
import { boundedMoneySchema } from '../lib/money.js';
import { applyDonationToLedger, recordPlatformTip } from '../lib/processDonationLedger.js';
import { HttpError } from '../lib/HttpError.js';
import { env } from '../config/env.js';
import {
  computeDaysLeftFromEndsAt,
  validateNewCampaignEndDate
} from '../lib/campaignEndsAt.js';
import { assertCampaignAcceptsDonations } from '../lib/assertCampaignAcceptsDonations.js';
import {
  canOwnerConfirmEnd,
  canRequestWithdrawal,
  getCampaignWithdrawalBalances,
  isFundraisingPeriodEnded,
  tryFinalizeCampaignEnded
} from '../lib/campaignLifecycle.js';
import { serializeCampaignWithLifecycle } from '../lib/serializeCampaignWithLifecycle.js';
import { serializeWithdrawalPayout } from '../lib/payoutMethods.js';
import { expireStaleBankTransferIntents } from '../lib/expireBankTransfers.js';
import { serializeBankTransferIntent } from '../lib/bankTransferSerialize.js';
import { serializePlatformBankAccount } from '../lib/platformBankAccountSerialize.js';

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

const createCampaignSchema = z
  .object({
    title: z.string().min(5).max(120),
    creatorName: z.string().min(2).max(80),
    creatorAvatar: z.string().url().optional(),
    category: z.nativeEnum(Category),
    shortDescription: z.string().min(20).max(240),
    fullDescription: z.string().min(40),
    goalAmount: z.number().int().positive(),
    campaignEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    coverImage: coverImageSchema,
    galleryImages: z.array(coverImageSchema).max(4).optional().default([]),
    verificationDocumentUrl: z
    .string()
    .min(1)
    .refine((s) => s.startsWith('/uploads/verification-ids/'), {
      message: 'ID verification document must be uploaded'
    }),
  termsAcceptedAt: z.string().datetime()
  })
  .superRefine((data, ctx) => {
    const extras = data.galleryImages ?? [];
    if (extras.includes(data.coverImage)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Gallery images must not duplicate the cover image',
        path: ['galleryImages']
      });
    }
    const seen = new Set<string>();
    for (const url of extras) {
      if (seen.has(url)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Duplicate gallery image URL',
          path: ['galleryImages']
        });
        return;
      }
      seen.add(url);
    }
  });

const createDonationSchema = z.object({
  /** Optional when authenticated; server uses account full name if missing (non-anonymous). */
  donorName: z.string().max(80).optional(),
  amount: boundedMoneySchema(1, 2_000_000_000),
  /** Voluntary platform tip (same currency), recorded separately from the campaign donation. */
  platformTipAmount: boundedMoneySchema(0, MAX_PLATFORM_TIP_PER_CHECKOUT)
    .optional()
    .default(0),
  currency: z.nativeEnum(Currency).default('GMD'),
  message: z.string().max(280).optional(),
  isAnonymous: z.boolean().default(false),
  avatarUrl: z.string().url().optional()
});

const createWithdrawalRequestSchema = z.object({
  campaignSlug: z.string().min(1),
  amount: boundedMoneySchema(1, 2_000_000_000),
  payoutMethodId: z.string().min(1),
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

    res.json(
      campaigns.map((c) => ({
        ...serializeCampaign(c),
        fundraisingPeriodEnded: isFundraisingPeriodEnded(c.endsAt),
        acceptingDonations: c.status === 'Active' && c.ownerConfirmedEndAt == null
      }))
    );
  })
);

const extensionRequestSchema = z.object({
  campaignEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().max(500).optional()
});

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

    const withdrawalRows = await prisma.withdrawalRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        campaign: { select: { title: true, slug: true } }
      }
    });

    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true }
    });
    const emailLower = me?.email?.toLowerCase() ?? '';

    await expireStaleBankTransferIntents();

    const bankTransferRows = await prisma.bankTransferIntent.findMany({
      where: {
        OR: [
          { userId },
          ...(emailLower ? [{ donorEmail: { equals: emailLower, mode: 'insensitive' as const } }] : [])
        ]
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: {
        campaign: { select: { title: true, slug: true } },
        platformBankAccount: true
      }
    });

    const pendingExtensions = await prisma.campaignExtensionRequest.findMany({
      where: {
        campaignId: { in: campaigns.map((c) => c.id) },
        status: 'Pending'
      },
      select: { id: true, campaignId: true, requestedEndDate: true, status: true }
    });
    const extByCampaign = new Map(
      pendingExtensions.map((e) => [
        e.campaignId,
        { id: e.id, requestedEndDate: e.requestedEndDate, status: e.status }
      ])
    );

    const serializedCampaigns = await Promise.all(
      campaigns.map((c) =>
        serializeCampaignWithLifecycle(c, {
          pendingExtension: extByCampaign.get(c.id) ?? null
        })
      )
    );

    res.json({
      campaigns: serializedCampaigns,
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
        updatedAt: w.updatedAt.toISOString(),
        ...serializeWithdrawalPayout(w)
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
      bankTransfers: bankTransferRows.map((row) => ({
        ...serializeBankTransferIntent(row),
        platformBankAccount: row.platformBankAccount
          ? serializePlatformBankAccount(row.platformBankAccount)
          : null
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

        if (!canRequestWithdrawal(campaign.status)) {
          throw new HttpError(
            400,
            'Withdrawals are only available for campaigns that are active or closed'
          );
        }

        const balances = await getCampaignWithdrawalBalances(
          tx,
          campaign.id,
          campaign.raisedAmount
        );
        const available = balances.availableForWithdrawal;

        if (body.amount > available) {
          throw new HttpError(
            400,
            `Amount exceeds available balance (D${available.toLocaleString()} available)`
          );
        }

        const payoutMethod = await tx.userPayoutMethod.findFirst({
          where: { id: body.payoutMethodId, userId }
        });
        if (!payoutMethod) {
          throw new HttpError(
            400,
            'Select a valid payout method. Add one under Payout settings on your dashboard first.'
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
            status: 'Pending',
            payoutMethodType: payoutMethod.type,
            payoutLabel: payoutMethod.label,
            payoutDetails: payoutMethod.details as Prisma.InputJsonValue
          },
          include: {
            campaign: { select: { title: true, slug: true } },
            user: { select: { email: true, fullName: true, phoneNumber: true } }
          }
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      }
    );

    const wrWithRelations = wr as Prisma.WithdrawalRequestGetPayload<{
      include: {
        campaign: { select: { title: true; slug: true } };
        user: { select: { email: true; fullName: true; phoneNumber: true } };
      };
    }>;

    const payoutEmailFields = {
      payoutMethodType: wrWithRelations.payoutMethodType,
      payoutLabel: wrWithRelations.payoutLabel,
      payoutDetails: wrWithRelations.payoutDetails
    };

    if (wrWithRelations.user?.email) {
      void sendWithdrawalRequestReceivedEmail({
        to: wrWithRelations.user.email,
        fullName: wrWithRelations.user.fullName,
        campaignTitle: wrWithRelations.campaign.title,
        campaignSlug: wrWithRelations.campaign.slug,
        requestedAmount: wrWithRelations.amount,
        netAmount: wrWithRelations.netAmount,
        processingFeeAmount: wrWithRelations.processingFeeAmount,
        currency: wrWithRelations.currency,
        organizerNote: wrWithRelations.note,
        ...payoutEmailFields
      });
    }

    void notifyAdminsWithdrawalRequested({
      campaignTitle: wrWithRelations.campaign.title,
      campaignSlug: wrWithRelations.campaign.slug,
      organizerName: wrWithRelations.user.fullName,
      organizerEmail: wrWithRelations.user.email,
      organizerPhone: wrWithRelations.user.phoneNumber ?? null,
      requestedAmount: wrWithRelations.amount,
      netAmount: wrWithRelations.netAmount,
      processingFeeAmount: wrWithRelations.processingFeeAmount,
      currency: wrWithRelations.currency,
      organizerNote: wrWithRelations.note,
      withdrawalRequestId: wrWithRelations.id,
      ...payoutEmailFields
    });

    await recordActivity({
      type: 'WITHDRAWAL_REQUESTED',
      title: `Withdrawal requested: D${wrWithRelations.amount.toLocaleString()} (net D${wrWithRelations.netAmount.toLocaleString()}) — ${wrWithRelations.campaign.title}`,
      detail: `Campaign slug: ${body.campaignSlug}`,
      campaignId: wrWithRelations.campaignId,
      userId,
      actorId: userId
    });

    res.status(201).json({
      id: wrWithRelations.id,
      campaignId: wrWithRelations.campaignId,
      campaignTitle: wrWithRelations.campaign.title,
      campaignSlug: wrWithRelations.campaign.slug,
      amount: wrWithRelations.amount,
      processingFeeAmount: wrWithRelations.processingFeeAmount,
      netAmount: wrWithRelations.netAmount,
      currency: wrWithRelations.currency,
      status: wrWithRelations.status,
      note: wrWithRelations.note,
      createdAt: wrWithRelations.createdAt.toISOString(),
      updatedAt: wrWithRelations.updatedAt.toISOString(),
      ...serializeWithdrawalPayout(wrWithRelations)
    });
  })
);

campaignsRouter.get(
  '/:slug/donations',
  asyncHandler(async (req, res) => {
    const slug = String(req.params.slug);
    const campaign = await prisma.campaign.findUnique({
      where: { slug },
      select: { id: true, status: true }
    });

    if (!campaign || campaign.status !== 'Active') {
      res.status(404).json({ message: 'Campaign not found' });
      return;
    }

    const donations = await prisma.donation.findMany({
      where: { campaignId: campaign.id },
      orderBy: { createdAt: 'desc' },
      take: 500
    });

    res.json(donations.map(serializeDonation));
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
          take: 5
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

    res.json(
      await serializeCampaignWithLifecycle(campaign)
    );
  })
);

campaignsRouter.post(
  '/:slug/confirm-end',
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    const campaign = await prisma.campaign.findUnique({
      where: { slug: String(req.params.slug) },
      include: { donations: { take: 1 } }
    });

    if (!campaign) {
      res.status(404).json({ message: 'Campaign not found' });
      return;
    }

    if (campaign.creatorId !== userId) {
      res.status(403).json({ message: 'Only the campaign organizer can confirm end of campaign' });
      return;
    }

    if (!canOwnerConfirmEnd(campaign)) {
      res.status(400).json({
        message:
          campaign.ownerConfirmedEndAt != null
            ? 'You have already confirmed end of campaign.'
            : 'This campaign cannot be confirmed ended in its current state.'
      });
      return;
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.campaign.update({
        where: { id: campaign.id },
        data: { ownerConfirmedEndAt: new Date() }
      });
      await tryFinalizeCampaignEnded(tx, campaign.id);
      return tx.campaign.findUnique({
        where: { id: campaign.id },
        include: { donations: { orderBy: { createdAt: 'desc' }, take: 10 } }
      });
    });

    if (!updated) {
      res.status(500).json({ message: 'Failed to update campaign' });
      return;
    }

    await recordActivity({
      type: 'CAMPAIGN_OWNER_CONFIRMED_END',
      title: `Organizer confirmed end: ${updated.title}`,
      detail: `Slug: ${updated.slug}`,
      campaignId: updated.id,
      userId: updated.creatorId,
      actorId: userId
    });

    res.json(await serializeCampaignWithLifecycle(updated));
  })
);

campaignsRouter.post(
  '/:slug/extension-requests',
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    const body = extensionRequestSchema.parse(req.body);
    const campaign = await prisma.campaign.findUnique({
      where: { slug: String(req.params.slug) }
    });

    if (!campaign) {
      res.status(404).json({ message: 'Campaign not found' });
      return;
    }

    if (campaign.creatorId !== userId) {
      res.status(403).json({ message: 'Only the campaign organizer can request an extension' });
      return;
    }

    if (campaign.status !== 'Active') {
      res.status(400).json({ message: 'Only active campaigns can request a period extension' });
      return;
    }

    const existingPending = await prisma.campaignExtensionRequest.findFirst({
      where: { campaignId: campaign.id, status: 'Pending' }
    });
    if (existingPending) {
      res.status(400).json({
        message: 'You already have a pending extension request for this campaign.'
      });
      return;
    }

    const endResult = validateNewCampaignEndDate(body.campaignEndDate);
    if (!endResult.ok) {
      res.status(400).json({ message: endResult.message });
      return;
    }

    if (endResult.endsAt.getTime() <= campaign.endsAt.getTime()) {
      res.status(400).json({
        message: 'The new end date must be after your current campaign end date.'
      });
      return;
    }

    const request = await prisma.campaignExtensionRequest.create({
      data: {
        campaignId: campaign.id,
        requestedById: userId,
        requestedEndDate: body.campaignEndDate,
        requestedEndsAt: endResult.endsAt,
        reason: body.reason?.trim() || null
      }
    });

    await recordActivity({
      type: 'CAMPAIGN_EXTENSION_REQUESTED',
      title: `Extension requested: ${campaign.title}`,
      detail: `New end date: ${body.campaignEndDate}`,
      campaignId: campaign.id,
      userId: campaign.creatorId,
      actorId: userId
    });

    res.status(201).json({
      id: request.id,
      campaignId: request.campaignId,
      requestedEndDate: request.requestedEndDate,
      status: request.status,
      reason: request.reason,
      createdAt: request.createdAt.toISOString()
    });
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
    const endResult = validateNewCampaignEndDate(body.campaignEndDate);
    if (!endResult.ok) {
      res.status(400).json({ message: endResult.message });
      return;
    }
    const { endsAt } = endResult;
    const initialDaysLeft = computeDaysLeftFromEndsAt(endsAt);

    const slug = await ensureUniqueSlug(body.title);
    const galleryImages = (body.galleryImages ?? []).filter((u) => u !== body.coverImage).slice(0, 4);

    // Use the organizer's own profile picture; no demo/placeholder fallback.
    let organizerAvatar: string | null = body.creatorAvatar ?? null;
    if (!organizerAvatar && req.userId) {
      const owner = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { avatarUrl: true }
      });
      organizerAvatar = owner?.avatarUrl ?? null;
    }

    const campaign = await prisma.campaign.create({
      data: {
        slug,
        title: body.title,
        creatorName: body.creatorName,
        creatorAvatar: organizerAvatar,
        category: body.category,
        shortDescription: body.shortDescription,
        fullDescription: body.fullDescription,
        goalAmount: body.goalAmount,
        daysLeft: initialDaysLeft,
        endsAt,
        coverImage: body.coverImage,
        galleryImages,
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
    if (env.NODE_ENV === 'production') {
      res.status(404).json({ message: 'Not found' });
      return;
    }

    const body = createDonationSchema.parse(req.body);

    const campaign = await prisma.campaign.findUnique({
      where: { slug: String(req.params.slug) }
    });

    if (!campaign) {
      res.status(404).json({ message: 'Campaign not found' });
      return;
    }

    try {
      await assertCampaignAcceptsDonations(campaign);
    } catch (err) {
      if (err instanceof HttpError) {
        res.status(err.status).json({ message: err.message });
        return;
      }
      throw err;
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

    if (updatedCampaign?.ownerConfirmedEndAt) {
      await prisma.$transaction(async (tx) => {
        await tryFinalizeCampaignEnded(tx, campaign.id);
      });
    }

    res.status(201).json(
      updatedCampaign ? await serializeCampaignWithLifecycle(updatedCampaign) : null
    );
  })
);
