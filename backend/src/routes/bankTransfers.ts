import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import { prisma } from '../lib/prisma.js';
import { optionalAuthenticate, AuthRequest } from '../lib/auth.js';
import { HttpError } from '../lib/HttpError.js';
import { donationCheckoutBodySchema } from '../lib/donationCheckoutSchema.js';
import { assertCampaignAcceptsDonations } from '../lib/assertCampaignAcceptsDonations.js';
import {
  bankTransferExpiresAt,
  generateUniqueBankTransferReference
} from '../lib/bankTransferReference.js';
import { expireStaleBankTransferIntents } from '../lib/expireBankTransfers.js';
import { serializeBankTransferIntent } from '../lib/bankTransferSerialize.js';
import { serializePlatformBankAccount } from '../lib/platformBankAccountSerialize.js';
import {
  notifyAdminsBankTransferPending,
  sendBankTransferPendingEmail
} from '../lib/mail.js';

export const bankTransfersRouter = Router();

const initiateSchema = donationCheckoutBodySchema.extend({
  platformBankAccountId: z.string().min(1),
  /** Required for guests so we can email transfer status updates. */
  donorEmail: z.string().email().optional()
});

async function resolveDonorDisplayName(
  body: z.infer<typeof donationCheckoutBodySchema>,
  userId?: string
): Promise<string> {
  if (body.isAnonymous) {
    return 'Anonymous';
  }
  const fromForm = body.donorName?.trim() ?? '';
  if (fromForm.length >= 2) {
    return fromForm;
  }
  if (userId) {
    const account = await prisma.user.findUnique({
      where: { id: userId },
      select: { fullName: true, isActive: true }
    });
    if (!account?.isActive) {
      throw new HttpError(401, 'Account is inactive');
    }
    const fromProfile = account.fullName?.trim() ?? '';
    if (fromProfile.length < 2) {
      throw new HttpError(400, 'Please enter your name on the form, or update your profile name.');
    }
    return fromProfile;
  }
  throw new HttpError(400, 'Please enter your name or mark the donation as anonymous');
}

bankTransfersRouter.post(
  '/initiate',
  optionalAuthenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const body = initiateSchema.parse(req.body);

    const campaign = await prisma.campaign.findUnique({
      where: { slug: body.campaignSlug }
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

    const bankAccount = await prisma.platformBankAccount.findFirst({
      where: { id: body.platformBankAccountId, isActive: true }
    });

    if (!bankAccount) {
      res.status(400).json({ message: 'Select a valid active bank account' });
      return;
    }

    const donorDisplayName = await resolveDonorDisplayName(body, req.userId);

    let donorEmail: string | null = body.donorEmail?.trim().toLowerCase() || null;
    if (req.userId) {
      const account = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { email: true, isActive: true }
      });
      if (!account?.isActive) {
        res.status(401).json({ message: 'Account is inactive' });
        return;
      }
      donorEmail = account.email.toLowerCase();
    } else if (!donorEmail) {
      res.status(400).json({
        message: 'Please enter your email so we can notify you when your bank transfer is confirmed.'
      });
      return;
    }

    const clientReference = await generateUniqueBankTransferReference();
    const expiresAt = bankTransferExpiresAt();

    const intent = await prisma.bankTransferIntent.create({
      data: {
        clientReference,
        campaignId: campaign.id,
        userId: !body.isAnonymous && req.userId ? req.userId : undefined,
        platformBankAccountId: bankAccount.id,
        declaredAmount: body.amount,
        platformTipAmount: body.platformTipAmount ?? 0,
        currency: body.currency,
        donorName: donorDisplayName,
        donorEmail,
        message: body.message?.trim() || null,
        isAnonymous: body.isAnonymous,
        avatarUrl: body.avatarUrl,
        expiresAt
      },
      include: {
        campaign: { select: { title: true, slug: true } },
        platformBankAccount: true,
        user: { select: { email: true, fullName: true } }
      }
    });

    void sendBankTransferPendingEmail({
      to: donorEmail,
      donorName: intent.donorName,
      campaignTitle: intent.campaign.title,
      campaignSlug: intent.campaign.slug,
      clientReference: intent.clientReference,
      declaredAmount: intent.declaredAmount,
      platformTipAmount: intent.platformTipAmount,
      expiresAt: intent.expiresAt,
      platformBankAccount: bankAccount
    });

    void notifyAdminsBankTransferPending({
      clientReference: intent.clientReference,
      campaignTitle: intent.campaign.title,
      campaignSlug: intent.campaign.slug,
      donorName: intent.donorName,
      donorEmail,
      declaredAmount: intent.declaredAmount,
      platformTipAmount: intent.platformTipAmount,
      expiresAt: intent.expiresAt,
      platformBankAccount: bankAccount
    });

    res.status(201).json({
      clientReference: intent.clientReference,
      expiresAt: intent.expiresAt.toISOString(),
      declaredAmount: intent.declaredAmount,
      platformTipAmount: intent.platformTipAmount,
      currency: intent.currency,
      campaignTitle: intent.campaign.title,
      campaignSlug: intent.campaign.slug,
      platformBankAccount: serializePlatformBankAccount(bankAccount),
      instructions: {
        referenceLabel:
          'Put this reference in your bank transfer remarks / narration exactly as shown',
        expiryDays: 5
      },
      trackUrl: `/track-bank-transfer?ref=${encodeURIComponent(intent.clientReference)}`
    });
  })
);

bankTransfersRouter.get(
  '/status/:reference',
  asyncHandler(async (req, res) => {
    await expireStaleBankTransferIntents();

    const reference = String(req.params.reference).trim().toUpperCase();
    const intent = await prisma.bankTransferIntent.findUnique({
      where: { clientReference: reference },
      include: {
        campaign: { select: { title: true, slug: true } },
        platformBankAccount: true
      }
    });

    if (!intent) {
      res.status(404).json({ message: 'Transfer reference not found' });
      return;
    }

    res.json({
      ...serializeBankTransferIntent(intent),
      // Do not expose contact email on the public status endpoint.
      donorEmail: null,
      platformBankAccount: intent.platformBankAccount
        ? serializePlatformBankAccount(intent.platformBankAccount)
        : null
    });
  })
);
