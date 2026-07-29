import type { Campaign, EasypayPaymentIntent } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';
import { applyDonationToLedger, recordPlatformTip } from './processDonationLedger.js';
import { serializeCampaign } from './serializers.js';
import { tryFinalizeCampaignEnded } from './campaignLifecycle.js';
import { sendDonationThankYouEmail } from './mail.js';
import { easypayCreateOrder, EasypayPartnerApiError } from './easypayPartner.js';
import { roundMoney } from './money.js';
import { lockEasypayPaymentIntentForUpdate } from './paymentIntentLock.js';

/** Parse a reported GMD total in bututs/cents so decimal amounts compare exactly. */
function parseGmdTotalCents(value: unknown): number | null {
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

export function isEasypayOrderPaidStatus(status: string): boolean {
  const n = String(status || '')
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (!n) {
    return false;
  }
  return (
    n === 'paid' ||
    n === 'completed' ||
    n === 'complete' ||
    n === 'succeeded' ||
    n === 'success' ||
    n === 'settled' ||
    n.endsWith('_paid') ||
    n.includes('paid')
  );
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
  status: 'succeeded' | 'pending';
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

  if (intent.donationId) {
    return { recorded: false };
  }

  const expectedGross = Math.round((intent.amount + intent.platformTipAmount) * 100);
  const got = parseGmdTotalCents(params.grossAmountFromWebhook);
  if (got !== null && got !== expectedGross) {
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
    if (!locked || locked.donationId) {
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
      where: { id: intent.id, donationId: null },
      data: { donationId: donation.id }
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

  if (intent.donationId) {
    const campaign = await prisma.campaign.findUnique({
      where: { id: intent.campaignId },
      include: {
        donations: { orderBy: { createdAt: 'desc' }, take: 10 }
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

  if (intent.donationId) {
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
      shouldFinalize = true;
      reconcilePaymentId = `epay-reconcile:${intent.partnerExternalBookingId}:${order.id}`;
      orderAmount = order.total;
      console.info('[easypay] reconcile: partner order looks paid', {
        partnerExternalBookingId: intent.partnerExternalBookingId,
        orderId: order.id,
        status: order.status
      });
    }
  } catch (err) {
    if (err instanceof EasypayPartnerApiError) {
      const bodyText = JSON.stringify(err.body ?? {}).toLowerCase();
      if (
        err.status === 409 ||
        bodyText.includes('already paid') ||
        bodyText.includes('already_paid') ||
        bodyText.includes('"paid"') ||
        (bodyText.includes('paid') && bodyText.includes('order'))
      ) {
        shouldFinalize = true;
        console.info('[easypay] reconcile: partner create-order indicates paid', {
          partnerExternalBookingId: intent.partnerExternalBookingId,
          status: err.status
        });
      } else {
        console.warn('[easypay] reconcile create-order failed', {
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
        // Reconcile without a partner amount uses intent totals (undefined skips mismatch check).
        // When order.amount is present it is validated fail-closed.
        grossAmountFromWebhook: orderAmount
      });
    } catch (err) {
      if (err instanceof EasypayAmountMismatchError) {
        console.error('[easypay] reconcile refused amount mismatch', err.message);
      } else {
        throw err;
      }
    }
  }

  return loadEasypayIntentForStatus(partnerExternalBookingId);
}
