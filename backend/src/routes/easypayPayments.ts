import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import { prisma } from '../lib/prisma.js';
import { assertCampaignAcceptsDonations } from '../lib/assertCampaignAcceptsDonations.js';
import { HttpError } from '../lib/HttpError.js';
import { optionalAuthenticate, AuthRequest } from '../lib/auth.js';
import { donationCheckoutBodySchema } from '../lib/donationCheckoutSchema.js';
import {
  easypayPartnerConfigured,
  easypayCreateOrder,
  easypayListWalletsForPlatform,
  easypayStartWalletCheckoutForPlatform,
  pickCheckoutWallet,
  easypayGatewayCodeNeedsPayerPhone,
  easypayApsAuthorizeForPlatform,
  easypayApsCompleteForPlatform,
  EasypayPartnerApiError
} from '../lib/easypayPartner.js';
import { finalizeEasypayIntentPaid, loadEasypayIntentForStatus } from '../lib/finalizeEasypayIntent.js';
import { extractEasypayPaymentMetadata, easypayPartnerPayloadIndicatesPaymentIncomplete } from '../lib/easypayPartnerPayload.js';

export const easypayPaymentsRouter = Router();

const easypayCheckoutBodySchema = donationCheckoutBodySchema.extend({
  channel: z.enum(['wave', 'yonna', 'aps']),
  payerPhone: z.string().max(32).optional()
});

const partnerRefBodySchema = z.object({
  partnerExternalBookingId: z.string().min(1).max(128)
});

const apsAuthorizeBodySchema = partnerRefBodySchema.extend({
  payerMobile: z.string().min(5).max(32)
});

const apsCompleteBodySchema = partnerRefBodySchema.extend({
  gatewayCode: z.string().min(1).max(64),
  authState: z.string().min(1).max(8192),
  otp: z.string().max(16).optional()
});

easypayPaymentsRouter.post(
  '/checkout',
  optionalAuthenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    if (!easypayPartnerConfigured()) {
      res.status(503).json({
        message:
          'Easypay partner checkout is not configured. Set EASYPAY_API_BASE_URL, INTERNAL_PARTNER_API_SECRET, and EASYPAY_PARTNER_BUSINESS_ID.'
      });
      return;
    }

    const body = easypayCheckoutBodySchema.parse(req.body);

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

    const platformTip = body.platformTipAmount ?? 0;
    const totalGmd = body.amount + platformTip;
    if (totalGmd > 2_000_000_000) {
      res.status(400).json({ message: 'Combined campaign donation and platform tip is too large.' });
      return;
    }

    const partnerExternalBookingId = `gf_epay_${randomBytes(16).toString('hex')}`;
    const userId = !body.isAnonymous && req.userId ? req.userId : null;

    const intent = await prisma.easypayPaymentIntent.create({
      data: {
        partnerExternalBookingId,
        easypayOrderId: '__pending__',
        campaignId: campaign.id,
        userId,
        amount: body.amount,
        platformTipAmount: platformTip,
        currency: body.currency,
        donorName: donorDisplayName,
        message: body.message?.trim() || null,
        isAnonymous: body.isAnonymous,
        avatarUrl: body.avatarUrl?.trim() || null
      }
    });

    try {
      const order = await easypayCreateOrder({
        partnerExternalBookingId,
        amountGmd: totalGmd,
        currency: body.currency
      });

      await prisma.easypayPaymentIntent.update({
        where: { id: intent.id },
        data: {
          easypayOrderId: order.id,
          orderPublicCode: order.publicCode ?? null
        }
      });

      const wallets = await easypayListWalletsForPlatform(order.id);
      const wallet = pickCheckoutWallet(wallets, body.channel);

      if (!wallet) {
        await prisma.easypayPaymentIntent.delete({ where: { id: intent.id } });
        res.status(503).json({
          message: `No ${body.channel} gateway found on this Easypay order. Check merchant wallet configuration.`,
          wallets: wallets.map((w) => ({ code: w.code, name: w.name, gatewayId: w.gatewayId }))
        });
        return;
      }

      if (body.channel === 'aps') {
        res.status(201).json({
          kind: 'aps' as const,
          partnerExternalBookingId,
          easypayOrderId: order.id,
          gatewayCode: wallet.code,
          campaignDonationAmount: body.amount,
          platformTipAmount: platformTip,
          chargeTotal: totalGmd
        });
        return;
      }

      const payerPhone =
        easypayGatewayCodeNeedsPayerPhone(wallet.code) && body.payerPhone?.trim()
          ? body.payerPhone.trim()
          : undefined;

      const launch = await easypayStartWalletCheckoutForPlatform(order.id, {
        gatewayCode: wallet.code,
        gatewayId: wallet.gatewayId,
        payerPhone
      });

      await prisma.easypayPaymentIntent.update({
        where: { id: intent.id },
        data: { lastGatewayCode: wallet.code }
      });

      res.status(201).json({
        kind: 'redirect' as const,
        partnerExternalBookingId,
        easypayOrderId: order.id,
        launchUrl: launch.launchUrl,
        qrPayload: launch.qrPayload,
        paymentHtml: launch.paymentHtml,
        checkoutAdapter: launch.checkoutAdapter,
        campaignDonationAmount: body.amount,
        platformTipAmount: platformTip,
        chargeTotal: totalGmd
      });
    } catch (err) {
      await prisma.easypayPaymentIntent.delete({ where: { id: intent.id } }).catch(() => {});
      if (err instanceof EasypayPartnerApiError) {
        res.status(err.status >= 400 && err.status < 600 ? err.status : 502).json({
          message: err.message
        });
        return;
      }
      throw err;
    }
  })
);

easypayPaymentsRouter.get(
  '/status/:partnerExternalBookingId',
  asyncHandler(async (req, res) => {
    if (!easypayPartnerConfigured()) {
      res.status(503).json({ message: 'Easypay partner checkout is not configured.' });
      return;
    }
    const partnerExternalBookingId = String(req.params.partnerExternalBookingId ?? '').trim();
    if (!partnerExternalBookingId) {
      res.status(400).json({ message: 'Missing reference' });
      return;
    }
    const result = await loadEasypayIntentForStatus(partnerExternalBookingId);
    res.json(result);
  })
);

easypayPaymentsRouter.post(
  '/aps/authorize',
  optionalAuthenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    if (!easypayPartnerConfigured()) {
      res.status(503).json({ message: 'Easypay partner checkout is not configured.' });
      return;
    }
    const body = apsAuthorizeBodySchema.parse(req.body);
    const intent = await prisma.easypayPaymentIntent.findUnique({
      where: { partnerExternalBookingId: body.partnerExternalBookingId }
    });
    if (!intent) {
      res.status(404).json({ message: 'Payment session not found' });
      return;
    }
    const wallets = await easypayListWalletsForPlatform(intent.easypayOrderId);
    const apsWallet = pickCheckoutWallet(wallets, 'aps');
    if (!apsWallet) {
      res.status(400).json({ message: 'APS gateway not available for this order' });
      return;
    }
    try {
      const result = await easypayApsAuthorizeForPlatform(intent.easypayOrderId, {
        gatewayCode: apsWallet.code,
        payerMobile: body.payerMobile.trim()
      });
      let authState = result.authState;
      if (!authState && result.raw !== undefined) {
        authState =
          typeof result.raw === 'object' ? JSON.stringify(result.raw) : String(result.raw);
      }
      await prisma.easypayPaymentIntent.update({
        where: { id: intent.id },
        data: { lastGatewayCode: apsWallet.code }
      });
      res.json({
        gatewayCode: apsWallet.code,
        authState,
        requiresOtp: result.requiresOtp
      });
    } catch (err) {
      if (err instanceof EasypayPartnerApiError) {
        res.status(err.status >= 400 && err.status < 600 ? err.status : 502).json({
          message: err.message
        });
        return;
      }
      throw err;
    }
  })
);

easypayPaymentsRouter.post(
  '/aps/complete',
  asyncHandler(async (req, res) => {
    if (!easypayPartnerConfigured()) {
      res.status(503).json({ message: 'Easypay partner checkout is not configured.' });
      return;
    }
    const body = apsCompleteBodySchema.parse(req.body);
    const intent = await prisma.easypayPaymentIntent.findUnique({
      where: { partnerExternalBookingId: body.partnerExternalBookingId },
      include: { campaign: true }
    });
    if (!intent) {
      res.status(404).json({ message: 'Payment session not found' });
      return;
    }
    try {
      const data = await easypayApsCompleteForPlatform(intent.easypayOrderId, {
        gatewayCode: body.gatewayCode,
        authState: body.authState,
        otp: body.otp?.trim() || undefined
      });

      const meta = extractEasypayPaymentMetadata(data);
      let paymentId = meta.paymentId;
      let ledgerAmountFromBody: unknown = meta.amount;
      const stillUnpaid = await prisma.easypayPaymentIntent.findUnique({
        where: { id: intent.id },
        select: { donationId: true }
      });
      if (!stillUnpaid?.donationId && !paymentId) {
        if (easypayPartnerPayloadIndicatesPaymentIncomplete(data)) {
          console.warn(
            '[easypay] APS complete: no paymentId and response looks non-final; not synthesizing ledger row',
            { partnerExternalBookingId: intent.partnerExternalBookingId }
          );
        } else {
          paymentId = `epay-aps:${intent.partnerExternalBookingId}`;
          ledgerAmountFromBody = undefined;
          console.info('[easypay] APS complete: synthesizing receipt id (no paymentId in response body)', {
            partnerExternalBookingId: intent.partnerExternalBookingId
          });
        }
      }
      if (paymentId && !stillUnpaid?.donationId) {
        try {
          await prisma.easypayWebhookReceipt.create({
            data: { paymentId, event: 'payment.completed' }
          });
        } catch (e) {
          if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) {
            throw e;
          }
        }
        await finalizeEasypayIntentPaid({
          intent,
          webhookPaymentId: paymentId,
          grossAmountFromWebhook: ledgerAmountFromBody
        });
      }

      res.json({ data });
    } catch (err) {
      if (err instanceof EasypayPartnerApiError) {
        res.status(err.status >= 400 && err.status < 600 ? err.status : 502).json({
          message: err.message
        });
        return;
      }
      throw err;
    }
  })
);
