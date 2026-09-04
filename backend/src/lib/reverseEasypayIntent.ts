import { prisma } from './prisma.js';
import { reverseDonationOnLedger } from './processDonationLedger.js';
import { lockEasypayPaymentIntentForUpdate } from './paymentIntentLock.js';
import { recordActivity } from './activityLog.js';

export type ReverseEasypayResult = {
  reversed: boolean;
  alreadyReversed: boolean;
  unknownBooking: boolean;
};

/**
 * Idempotent: records a DPay reversal on the payment intent and, when a donation
 * was already credited, unwinds campaign totals, donor count, and any platform tip.
 */
export async function reverseEasypayIntent(params: {
  partnerExternalBookingId: string;
  reason?: string | null;
  actorId?: string | null;
}): Promise<ReverseEasypayResult> {
  const intent = await prisma.easypayPaymentIntent.findUnique({
    where: { partnerExternalBookingId: params.partnerExternalBookingId },
    include: { campaign: true, donation: true, platformTip: true }
  });

  if (!intent) {
    return { reversed: false, alreadyReversed: false, unknownBooking: true };
  }

  const now = new Date();
  const reason = params.reason?.trim() || 'Easypay payment reversed';

  const outcome = await prisma.$transaction(async (tx) => {
    await lockEasypayPaymentIntentForUpdate(tx, intent.id);

    const locked = await tx.easypayPaymentIntent.findUnique({
      where: { id: intent.id },
      include: { donation: true, platformTip: true }
    });
    if (!locked) {
      return 'missing' as const;
    }

    const donationAlreadyReversed = !locked.donation || locked.donation.reversedAt != null;
    const tipAlreadyReversed = !locked.platformTip || locked.platformTip.reversedAt != null;
    if (locked.reversedAt && donationAlreadyReversed && tipAlreadyReversed) {
      return 'already' as const;
    }

    if (!locked.reversedAt) {
      await tx.easypayPaymentIntent.update({
        where: { id: locked.id },
        data: { reversedAt: now }
      });
    }

    if (locked.donation && locked.donation.reversedAt == null) {
      await reverseDonationOnLedger(tx, locked.donation, { reason, now });
    }

    if (locked.platformTip && locked.platformTip.reversedAt == null) {
      const claimedTip = await tx.platformTip.updateMany({
        where: { id: locked.platformTip.id, reversedAt: null },
        data: { reversedAt: now }
      });
      if (claimedTip.count === 1) {
        await tx.platformStat.update({
          where: { id: 'platform' },
          data: {
            totalPlatformTips: { decrement: locked.platformTip.amount }
          }
        });
        await tx.$executeRaw`
          UPDATE "PlatformStat"
          SET "totalPlatformTips" = 0
          WHERE id = 'platform' AND "totalPlatformTips" < 0
        `;
      }
    }

    return 'reversed' as const;
  });

  if (outcome === 'missing') {
    return { reversed: false, alreadyReversed: false, unknownBooking: true };
  }
  if (outcome === 'already') {
    return { reversed: false, alreadyReversed: true, unknownBooking: false };
  }

  console.info('[easypay] donation reversed', {
    partnerExternalBookingId: params.partnerExternalBookingId,
    campaignSlug: intent.campaign.slug,
    donationId: intent.donationId,
    reason
  });

  await recordActivity({
    type: 'DONATION_REVERSED',
    title: `Donation reversed: ${intent.campaign.title}`,
    detail: [
      `DPay booking ${intent.partnerExternalBookingId}`,
      intent.donationId ? `donation ${intent.donationId}` : 'no donation recorded yet',
      reason,
      params.actorId ? 'manual admin' : 'partner webhook'
    ].join(' · '),
    campaignId: intent.campaignId,
    userId: intent.userId ?? null,
    actorId: params.actorId ?? null
  });

  return { reversed: true, alreadyReversed: false, unknownBooking: false };
}
