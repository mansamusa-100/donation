import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import { prisma } from '../lib/prisma.js';
import { serializeCampaign } from '../lib/serializers.js';
import { assertCampaignAcceptsDonations } from '../lib/assertCampaignAcceptsDonations.js';
import { HttpError } from '../lib/HttpError.js';
import { waveCreateCheckoutSession, waveGetCheckoutSession } from '../lib/waveCheckout.js';
import { finalizeWaveIntentFromCheckoutSession } from '../lib/waveFinalizeIntent.js';
import { optionalAuthenticate, AuthRequest } from '../lib/auth.js';
import { env } from '../config/env.js';
import { donationCheckoutBodySchema } from '../lib/donationCheckoutSchema.js';
import { easypayPartnerConfigured } from '../lib/easypayPartner.js';
import { roundMoney } from '../lib/money.js';
import { easypayPaymentsRouter } from './easypayPayments.js';

export const paymentsRouter = Router();

paymentsRouter.use('/easypay', easypayPaymentsRouter);

function waveDonationsEnabled(): boolean {
  return env.WAVE_API_KEY.trim().length > 0;
}

function yonnaDonationsEnabled(): boolean {
  return (
    env.YONNA_FOREX_API_URL.trim().length > 0 &&
    env.YONNA_FOREX_SECRET_KEY.trim().length > 0 &&
    env.YONNA_FOREX_CLIENT_ID.trim().length > 0
  );
}

function apsDonationsEnabled(): boolean {
  return (
    env.APS_WALLET_BASE_URL.trim().length > 0 &&
    env.APS_WALLET_MOBILE.trim().length > 0 &&
    env.APS_WALLET_PASSWORD.trim().length > 0
  );
}

paymentsRouter.get(
  '/providers',
  asyncHandler(async (_req, res) => {
  const waveOk = waveDonationsEnabled();
  const apsCfg = apsDonationsEnabled();
  const yonnaCfg = yonnaDonationsEnabled();
  const easypay = easypayPartnerConfigured();
  const bankAccountCount = await prisma.platformBankAccount.count({
    where: { isActive: true }
  });
  const bankOk = bankAccountCount > 0;
  res.json({
    /** When true, Wave / APS / Yonna checkout uses Easypay partner API (single dashboard business). */
    easypayCheckout: easypay,
    providers: [
      {
        id: 'wave',
        label: 'Wave',
        configured: easypay || waveOk,
        checkoutLive: easypay || waveOk
      },
      {
        id: 'aps',
        label: 'APS Money',
        configured: easypay || apsCfg,
        checkoutLive: easypay
      },
      {
        id: 'yonna',
        label: 'Yonna',
        configured: easypay || yonnaCfg,
        checkoutLive: easypay
      },
      {
        id: 'bank',
        label: 'Bank transfer',
        configured: bankOk,
        checkoutLive: bankOk
      }
    ] as const
  });
})
);

const waveSessionBodySchema = donationCheckoutBodySchema;

const waveConfirmBodySchema = z.object({
  clientReference: z.string().min(1).max(255)
});

function buildPaymentReturnBaseUrl() {
  const base = env.CLIENT_ORIGIN.replace(/\/$/, '');
  return `${base}/payment/wave/return`;
}

paymentsRouter.post(
  '/wave/session',
  optionalAuthenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    if (!env.WAVE_API_KEY.trim()) {
      res.status(503).json({
        message:
          'Wave Checkout is not configured. Set WAVE_API_KEY (and optional WAVE_SIGNING_SECRET) in the server environment.'
      });
      return;
    }

    const body = waveSessionBodySchema.parse(req.body);

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
            message: 'Please enter your name on the form, or mark the donation as anonymous.'
          });
          return;
        }
        donorDisplayName = fromProfile;
      } else {
        res.status(400).json({
          message: 'Please enter your name or mark the donation as anonymous.'
        });
        return;
      }
    }

    const clientReference = `gf_wpay_${randomBytes(16).toString('hex')}`;
    const returnBase = buildPaymentReturnBaseUrl();
    const successUrl = `${returnBase}?ref=${encodeURIComponent(clientReference)}`;
    const errorUrl = `${returnBase}?ref=${encodeURIComponent(clientReference)}&wave_error=1`;

    const waveCurrency = env.WAVE_CHECKOUT_CURRENCY.trim().toUpperCase() || 'GMD';
    const platformTip = body.platformTipAmount ?? 0;
    const waveChargeTotal = roundMoney(body.amount + platformTip);
    if (waveChargeTotal > 2_000_000_000) {
      res.status(400).json({ message: 'Combined campaign donation and platform tip is too large.' });
      return;
    }
    // Wave expects a decimal string, e.g. "150.75".
    const amountString = waveChargeTotal.toFixed(2);

    const waveSession = await waveCreateCheckoutSession({
      amount: amountString,
      currency: waveCurrency,
      success_url: successUrl,
      error_url: errorUrl,
      client_reference: clientReference
    });

    const userId = !body.isAnonymous && req.userId ? req.userId : null;

    await prisma.wavePaymentIntent.create({
      data: {
        clientReference,
        campaignId: campaign.id,
        userId,
        amount: body.amount,
        platformTipAmount: platformTip,
        currency: body.currency,
        donorName: donorDisplayName,
        message: body.message?.trim() || null,
        isAnonymous: body.isAnonymous,
        waveSessionId: waveSession.id,
        waveCheckoutStatus: waveSession.checkout_status,
        wavePaymentStatus: waveSession.payment_status
      }
    });

    res.status(201).json({
      clientReference,
      waveSessionId: waveSession.id,
      waveLaunchUrl: waveSession.wave_launch_url,
      checkoutStatus: waveSession.checkout_status,
      paymentStatus: waveSession.payment_status,
      campaignDonationAmount: body.amount,
      platformTipAmount: platformTip,
      waveChargeTotal
    });
  })
);

paymentsRouter.post(
  '/wave/confirm',
  optionalAuthenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    if (!env.WAVE_API_KEY.trim()) {
      res.status(503).json({ message: 'Wave Checkout is not configured.' });
      return;
    }

    const body = waveConfirmBodySchema.parse(req.body);

    const intent = await prisma.wavePaymentIntent.findUnique({
      where: { clientReference: body.clientReference },
      include: { campaign: true }
    });

    if (!intent) {
      res.status(404).json({ message: 'Payment session not found' });
      return;
    }

    if (intent.donationId) {
      const campaign = await prisma.campaign.findUnique({
        where: { id: intent.campaignId },
        include: {
          donations: { orderBy: { createdAt: 'desc' }, take: 10 }
        }
      });
      res.json({
        status: 'already_completed' as const,
        campaign: campaign ? serializeCampaign(campaign) : null,
        campaignDonationAmount: intent.amount,
        platformTipAmount: intent.platformTipAmount,
        waveChargeTotal: intent.amount + intent.platformTipAmount
      });
      return;
    }

    if (!intent.waveSessionId) {
      res.status(400).json({ message: 'Missing Wave session' });
      return;
    }

    const session = await waveGetCheckoutSession(intent.waveSessionId);

    const outcome = await finalizeWaveIntentFromCheckoutSession(intent, {
      amount: session.amount,
      checkout_status: session.checkout_status,
      payment_status: session.payment_status
    });

    if (outcome.kind === 'already_completed') {
      res.json({
        status: 'already_completed' as const,
        campaign: outcome.campaign,
        campaignDonationAmount: intent.amount,
        platformTipAmount: intent.platformTipAmount,
        waveChargeTotal: intent.amount + intent.platformTipAmount
      });
      return;
    }

    if (outcome.kind === 'pending') {
      res.json({
        status: 'pending' as const,
        checkoutStatus: outcome.checkoutStatus,
        paymentStatus: outcome.paymentStatus,
        waveSessionId: outcome.waveSessionId || session.id,
        campaignDonationAmount: intent.amount,
        platformTipAmount: intent.platformTipAmount,
        waveChargeTotal: intent.amount + intent.platformTipAmount
      });
      return;
    }

    if (outcome.kind === 'amount_mismatch') {
      res.status(409).json({
        message: 'Paid amount does not match expected donation. Contact support.',
        waveAmount: session.amount,
        expectedCampaignDonation: intent.amount,
        expectedPlatformTip: intent.platformTipAmount,
        expectedWaveTotal: intent.amount + intent.platformTipAmount
      });
      return;
    }

    res.json({
      status: 'succeeded' as const,
      campaign: outcome.campaign,
      campaignDonationAmount: intent.amount,
      platformTipAmount: intent.platformTipAmount,
      waveChargeTotal: intent.amount + intent.platformTipAmount
    });
  })
);
