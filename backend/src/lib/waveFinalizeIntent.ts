import type { Campaign, WavePaymentIntent } from '@prisma/client';
import { prisma } from './prisma.js';
import { applyDonationToLedger, recordPlatformTip } from './processDonationLedger.js';
import { waveAmountMatchesExpected } from './waveCheckout.js';
import { serializeCampaign } from './serializers.js';
import { sendDonationThankYouEmail } from './mail.js';

export type WaveCheckoutSnapshot = {
  amount: string;
  checkout_status: string;
  payment_status: string;
};

export type FinalizeWaveIntentResult =
  | {
      kind: 'already_completed';
      campaign: ReturnType<typeof serializeCampaign> | null;
    }
  | {
      kind: 'pending';
      checkoutStatus: string;
      paymentStatus: string;
      waveSessionId: string;
    }
  | { kind: 'amount_mismatch' }
  | {
      kind: 'succeeded';
      campaign: ReturnType<typeof serializeCampaign> | null;
    };

type IntentWithCampaign = WavePaymentIntent & { campaign: Campaign };

/**
 * Applies the same rules as the Wave `/confirm` poll: idempotent if already donated,
 * updates Wave status fields, then records donation when checkout is complete and paid.
 */
export async function finalizeWaveIntentFromCheckoutSession(
  intent: IntentWithCampaign,
  session: WaveCheckoutSnapshot
): Promise<FinalizeWaveIntentResult> {
  if (intent.donationId) {
    const campaign = await prisma.campaign.findUnique({
      where: { id: intent.campaignId },
      include: {
        donations: { orderBy: { createdAt: 'desc' }, take: 10 }
      }
    });
    return {
      kind: 'already_completed',
      campaign: campaign ? serializeCampaign(campaign) : null
    };
  }

  await prisma.wavePaymentIntent.update({
    where: { id: intent.id },
    data: {
      waveCheckoutStatus: session.checkout_status,
      wavePaymentStatus: session.payment_status
    }
  });

  if (session.payment_status !== 'succeeded' || session.checkout_status !== 'complete') {
    return {
      kind: 'pending',
      checkoutStatus: session.checkout_status,
      paymentStatus: session.payment_status,
      waveSessionId: intent.waveSessionId ?? ''
    };
  }

  const waveExpectedTotal = intent.amount + intent.platformTipAmount;
  if (!waveAmountMatchesExpected(session.amount, waveExpectedTotal)) {
    return { kind: 'amount_mismatch' };
  }

  const updatedCampaign = await prisma.$transaction(async (tx) => {
    const donation = await applyDonationToLedger(tx, {
      campaignId: intent.campaignId,
      campaignSlug: intent.campaign.slug,
      userId: intent.userId ?? undefined,
      donorName: intent.donorName,
      amount: intent.amount,
      currency: intent.currency,
      message: intent.message,
      isAnonymous: intent.isAnonymous,
      avatarUrl: undefined
    });

    await tx.wavePaymentIntent.update({
      where: { id: intent.id },
      data: { donationId: donation.id }
    });

    if (intent.platformTipAmount > 0) {
      const existingTip = await tx.platformTip.findUnique({
        where: { wavePaymentIntentId: intent.id }
      });
      if (!existingTip) {
        await recordPlatformTip(tx, {
          amount: intent.platformTipAmount,
          currency: intent.currency,
          donorName: intent.donorName,
          userId: intent.userId,
          campaignId: intent.campaignId,
          wavePaymentIntentId: intent.id
        });
      }
    }

    return tx.campaign.findUnique({
      where: { id: intent.campaignId },
      include: {
        donations: { orderBy: { createdAt: 'desc' }, take: 10 }
      }
    });
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
    })().catch((err) => console.error('[mail] donation thank you (wave)', err));
  }

  return {
    kind: 'succeeded',
    campaign: updatedCampaign ? serializeCampaign(updatedCampaign) : null
  };
}
