import type { Campaign, EasypayPaymentIntent } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';
import { applyDonationToLedger, recordPlatformTip } from './processDonationLedger.js';
import { serializeCampaign } from './serializers.js';
import { tryFinalizeCampaignEnded } from './campaignLifecycle.js';
import { sendDonationThankYouEmail } from './mail.js';
import { easypayCreateOrder, EasypayPartnerApiError } from './easypayPartner.js';
import { partnerCreateOrderErrorIndicatesAlreadyPaid } from './easypayPartnerPayload.js';
import { roundMoney } from './money.js';
import { lockEasypayPaymentIntentForUpdate } from './paymentIntentLock.js';
import { recentActiveDonationsInclude } from './donationActive.js';
import { notifyOrganizerOfDonation } from './webPush.js';

/** Parse a reported GMD total in bututs/cents so decimal amounts compare exactly. */
export function parseGmdTotalCents(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value * 100);
  }
  if (typeof value === 'string') {
    const n = Number.parseFloat(value);
    if (Number.isFinite(n)) {
      return Math.round(n * 100);
    }
  }
  return null;
}

const EASYPAY_PAID_STATUSES = new Set([
  'paid',
  'completed',
  'complete',
  'succeeded',
  'success',
  'settled'
]);

/**
 * Exact allowlist only — never use substring `includes('paid')` (matches `unpaid` / `not_paid`).
 */
export function isEasypayOrderPaidStatus(status: string): boolean {
  const n = String(status || '')
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (!n || n === 'unpaid' || n === 'not_paid' || n.includes('unpaid')) {
    return false;
  }
  if (EASYPAY_PAID_STATUSES.has(n)) {
    return true;
  }
  // e.g. order_paid — but not not_paid (already excluded above)
  return n.endsWith('_paid');
}

export class EasypayAmountMismatchError extends Error {
  readonly expectedGrossCents: number;
  readonly gotCents: number;

  constructor(expectedGrossCents: number, gotCents: number) {
    super(
      `Easypay amount mismatch: expected ${expectedGrossCents} cents, got ${gotCents} cents`
    );
    this.name = 'EasypayAmountMismatchError';
    this.expectedGrossCents = expectedGrossCents;
    this.gotCents = gotCents;
  }
}

type IntentWithCampaign = EasypayPaymentIntent & { campaign: Campaign };

export type EasypayStatusResult = {
  status: 'succeeded' | 'pending' | 'reversed';
  campaign: ReturnType<typeof serializeCampaign> | null;
  campaignDonationAmount: number;
  platformTipAmount: number;
  chargeTotal: number;
};

/**
 * Idempotent: records donation + tip once.
 * Fails closed when the partner reports a gross amount that does not match the intent.
 * Uses row locks so concurrent webhook + status poll cannot double-credit.
 */
export async function finalizeEasypayIntentPaid(params: {
  intent: IntentWithCampaign;
  webhookPaymentId: string;
  grossAmountFromWebhook: unknown;
}): Promise<{ recorded: boolean }> {
  const { intent, webhookPaymentId } = params;

  if (intent.donationId || intent.reversedAt) {
    return { recorded: false };
  }

  const expectedGross = Math.round((intent.amount + intent.platformTipAmount) * 100);
  const got = parseGmdTotalCents(params.grossAmountFromWebhook);
  // Fail closed: missing/unparseable partner amount must not credit the ledger.
  if (got === null) {
    console.error('[easypay] missing partner amount — refusing to finalize', {
      partnerExternalBookingId: intent.partnerExternalBookingId,
      expectedGrossCents: expectedGross,
      webhookPaymentId
    });
    throw new EasypayAmountMismatchError(expectedGross, Number.NaN);
  }
  if (got !== expectedGross) {
    console.error('[easypay] amount mismatch vs intent — refusing to finalize', {
      partnerExternalBookingId: intent.partnerExternalBookingId,
      expectedGrossCents: expectedGross,
      gotCents: got,
      webhookPaymentId
    });
    throw new EasypayAmountMismatchError(expectedGross, got);
  }

  const recorded = await prisma.$transaction(async (tx) => {
    await lockEasypayPaymentIntentForUpdate(tx, intent.id);

    const locked = await tx.easypayPaymentIntent.findUnique({
      where: { id: intent.id }
    });
    if (!locked || locked.donationId || locked.reversedAt) {
      return false;
    }

    const donation = await applyDonationToLedger(tx, {
      campaignId: intent.campaignId,
      campaignSlug: intent.campaign.slug,
      userId: intent.userId ?? undefined,
      donorName: intent.donorName,
      amount: intent.amount,
      currency: intent.currency,
      message: intent.message,
      isAnonymous: intent.isAnonymous,
      avatarUrl: intent.avatarUrl ?? undefined
    });

    const claimed = await tx.easypayPaymentIntent.updateMany({
      where: { id: intent.id, donationId: null, reversedAt: null },
      data: {
        donationId: donation.id,
        lastPaymentId: webhookPaymentId
      }
    });
    if (claimed.count !== 1) {
      throw new Error('Failed to claim Easypay payment intent (concurrent finalize)');
    }

    if (intent.platformTipAmount > 0) {
      const existingTip = await tx.platformTip.findUnique({
        where: { easypayPaymentIntentId: intent.id }
      });
      if (!existingTip) {
        await recordPlatformTip(tx, {
          amount: intent.platformTipAmount,
          currency: intent.currency,
          donorName: intent.donorName,
          userId: intent.userId,
          campaignId: intent.campaignId,
          easypayPaymentIntentId: intent.id
        });
      }
    }

    await tryFinalizeCampaignEnded(tx, intent.campaignId);
    return true;
  });

  if (!recorded) {
    return { recorded: false };
  }

  console.info('[easypay] donation recorded', {
    partnerExternalBookingId: intent.partnerExternalBookingId,
    campaignSlug: intent.campaign.slug,
    campaignDonationAmount: intent.amount,
    platformTipAmount: intent.platformTipAmount,
    currency: intent.currency,
    webhookPaymentId,
    donorName: intent.isAnonymous ? 'Anonymous' : intent.donorName
  });

  if (intent.userId) {
    void (async () => {
      const u = await prisma.user.findUnique({
        where: { id: intent.userId! },
        select: { email: true }
      });
      if (u?.email) {
        await sendDonationThankYouEmail({
          to: u.email,
          donorName: intent.donorName,
          amount: intent.amount,
          currency: intent.currency,
          campaignTitle: intent.campaign.title,
          campaignSlug: intent.campaign.slug,
          platformTipAmount: intent.platformTipAmount
        });
      }
    })().catch((err) => console.error('[mail] donation thank you (easypay)', err));
  }

  notifyOrganizerOfDonation({
    campaignId: intent.campaignId,
    campaignTitle: intent.campaign.title,
    campaignSlug: intent.campaign.slug,
    amount: intent.amount,
    currency: intent.currency,
    donorName: intent.donorName,
    isAnonymous: intent.isAnonymous
  });

  return { recorded: true };
}

export async function loadEasypayIntentForStatus(
  partnerExternalBookingId: string
): Promise<EasypayStatusResult> {
  const intent = await prisma.easypayPaymentIntent.findUnique({
    where: { partnerExternalBookingId },
    include: { campaign: true }
  });

  if (!intent) {
    throw new Error('Payment session not found');
  }

  const chargeTotal = roundMoney(intent.amount + intent.platformTipAmount);

  if (intent.reversedAt) {
    return {
      status: 'reversed',
      campaign: null,
      campaignDonationAmount: intent.amount,
      platformTipAmount: intent.platformTipAmount,
      chargeTotal
    };
  }

  if (intent.donationId) {
    const campaign = await prisma.campaign.findUnique({
      where: { id: intent.campaignId },
      include: {
        donations: recentActiveDonationsInclude(10)
      }
    });
    return {
      status: 'succeeded',
      campaign: campaign ? serializeCampaign(campaign) : null,
      campaignDonationAmount: intent.amount,
      platformTipAmount: intent.platformTipAmount,
      chargeTotal
    };
  }

  return {
    status: 'pending',
    campaign: null,
    campaignDonationAmount: intent.amount,
    platformTipAmount: intent.platformTipAmount,
    chargeTotal
  };
}

/**
 * If local intent is still unpaid, ask DPay for the order and finalize when the order is paid.
 * Covers missed/failed webhook handling so the donor pending page can leave the loading state.
 */
export async function reconcileEasypayIntentIfPaid(
  partnerExternalBookingId: string
): Promise<EasypayStatusResult> {
  const intent = await prisma.easypayPaymentIntent.findUnique({
    where: { partnerExternalBookingId },
    include: { campaign: true }
  });

  if (!intent) {
    throw new Error('Payment session not found');
  }

  if (intent.donationId || intent.reversedAt) {
    return loadEasypayIntentForStatus(partnerExternalBookingId);
  }

  const chargeTotal = roundMoney(intent.amount + intent.platformTipAmount);
  let shouldFinalize = false;
  let reconcilePaymentId = `epay-reconcile:${intent.partnerExternalBookingId}`;
  let orderAmount: unknown;

  try {
    const order = await easypayCreateOrder({
      partnerExternalBookingId: intent.partnerExternalBookingId,
      amountGmd: chargeTotal,
      currency: intent.currency
    });
    if (isEasypayOrderPaidStatus(order.status)) {
      const cents = parseGmdTotalCents(order.total);
      if (cents === null) {
        console.warn('[easypay] reconcile: paid status but missing order amount — not finalizing', {
          partnerExternalBookingId: intent.partnerExternalBookingId,
          orderId: order.id,
          status: order.status
        });
      } else {
        shouldFinalize = true;
        reconcilePaymentId = `epay-reconcile:${intent.partnerExternalBookingId}:${order.id}`;
        orderAmount = order.total;
        console.info('[easypay] reconcile: partner order looks paid', {
          partnerExternalBookingId: intent.partnerExternalBookingId,
          orderId: order.id,
          status: order.status
        });
      }
    }
  } catch (err) {
    if (err instanceof EasypayPartnerApiError) {
      // Bare 409 is NOT enough (security). Exact partner copy
      // "This partner booking is already paid." is a trusted signal for this booking id.
      if (partnerCreateOrderErrorIndicatesAlreadyPaid(err)) {
        shouldFinalize = true;
        orderAmount = chargeTotal;
        reconcilePaymentId = `epay-reconcile-already-paid:${intent.partnerExternalBookingId}`;
        console.info('[easypay] reconcile: partner reports booking already paid', {
          partnerExternalBookingId: intent.partnerExternalBookingId,
          status: err.status
        });
      } else {
        console.warn('[easypay] reconcile create-order failed — not treating as paid', {
          partnerExternalBookingId: intent.partnerExternalBookingId,
          status: err.status,
          message: err.message.slice(0, 300)
        });
      }
    } else {
      console.warn('[easypay] reconcile error', err);
    }
  }

  if (shouldFinalize) {
    try {
      await prisma.easypayWebhookReceipt.create({
        data: { paymentId: reconcilePaymentId, event: 'payment.completed' }
      });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) {
        throw e;
      }
    }
    try {
      await finalizeEasypayIntentPaid({
        intent,
        webhookPaymentId: reconcilePaymentId,
        grossAmountFromWebhook: orderAmount
      });
    } catch (err) {
      if (err instanceof EasypayAmountMismatchError) {
        console.error('[easypay] reconcile refused amount mismatch/missing', err.message);
      } else {
        throw err;
      }
    }
  }

  return loadEasypayIntentForStatus(partnerExternalBookingId);
}
