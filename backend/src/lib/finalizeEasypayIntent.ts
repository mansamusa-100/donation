import type { Campaign, EasypayPaymentIntent } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';
import { applyDonationToLedger, recordPlatformTip } from './processDonationLedger.js';
import { serializeCampaign } from './serializers.js';
import { tryFinalizeCampaignEnded } from './campaignLifecycle.js';
import { sendDonationThankYouEmail } from './mail.js';
import { easypayCreateOrder, EasypayPartnerApiError } from './easypayPartner.js';
import { roundMoney } from './money.js';

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
 * On `payment.completed`, trust the partner event — amount mismatches are logged but do not block
 * recording (they previously left donors stuck on the pending screen while DPay returned 200).
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
    console.warn(
      '[easypay] amount mismatch vs intent — still finalizing because partner marked payment completed',
      {
        partnerExternalBookingId: intent.partnerExternalBookingId,
        expectedGrossCents: expectedGross,
        gotCents: got,
        webhookPaymentId
      }
    );
  }

  await prisma.$transaction(async (tx) => {
    const locked = await tx.easypayPaymentIntent.findUnique({
      where: { id: intent.id }
    });
    if (locked?.donationId) {
      return null;
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

    await tx.easypayPaymentIntent.update({
      where: { id: intent.id },
      data: { donationId: donation.id }
    });

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

  try {
    const order = await easypayCreateOrder({
      partnerExternalBookingId: intent.partnerExternalBookingId,
      amountGmd: chargeTotal,
      currency: intent.currency
    });
    if (isEasypayOrderPaidStatus(order.status)) {
      shouldFinalize = true;
      reconcilePaymentId = `epay-reconcile:${intent.partnerExternalBookingId}:${order.id}`;
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
    await finalizeEasypayIntentPaid({
      intent,
      webhookPaymentId: reconcilePaymentId,
      grossAmountFromWebhook: undefined
    });
  }

  return loadEasypayIntentForStatus(partnerExternalBookingId);
}
