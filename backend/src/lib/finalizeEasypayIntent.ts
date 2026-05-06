import type { Campaign, EasypayPaymentIntent } from '@prisma/client';
import { prisma } from './prisma.js';
import { applyDonationToLedger, recordPlatformTip } from './processDonationLedger.js';
import { serializeCampaign } from './serializers.js';
import { sendDonationThankYouEmail } from './mail.js';

function parseGmdTotal(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value);
  }
  if (typeof value === 'string') {
    const n = Number.parseFloat(value);
    if (Number.isFinite(n)) {
      return Math.round(n);
    }
  }
  return null;
}

type IntentWithCampaign = EasypayPaymentIntent & { campaign: Campaign };

/**
 * Idempotent: records donation + tip once; dedupe via EasypayWebhookReceipt (caller).
 */
export async function finalizeEasypayIntentPaid(params: {
  intent: IntentWithCampaign;
  webhookPaymentId: string;
  grossAmountFromWebhook: unknown;
}): Promise<void> {
  const { intent, webhookPaymentId } = params;
  const expectedGross = intent.amount + intent.platformTipAmount;
  const got = parseGmdTotal(params.grossAmountFromWebhook);
  if (got !== null && got !== expectedGross) {
    console.warn('[easypay] amount mismatch vs intent', {
      partnerExternalBookingId: intent.partnerExternalBookingId,
      expectedGross,
      got,
      webhookPaymentId
    });
    return;
  }

  if (intent.donationId) {
    return;
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
}

export async function loadEasypayIntentForStatus(
  partnerExternalBookingId: string
): Promise<{
  status: 'succeeded' | 'pending';
  campaign: ReturnType<typeof serializeCampaign> | null;
  campaignDonationAmount: number;
  platformTipAmount: number;
  chargeTotal: number;
}> {
  const intent = await prisma.easypayPaymentIntent.findUnique({
    where: { partnerExternalBookingId },
    include: { campaign: true }
  });

  if (!intent) {
    throw new Error('Payment session not found');
  }

  const chargeTotal = intent.amount + intent.platformTipAmount;

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
