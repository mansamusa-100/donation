import { prisma } from './prisma.js';
import {
  ensurePlatformStatRow,
  reverseDonationOnLedger
} from './processDonationLedger.js';
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

    // Prefer the linked donation; if include is empty but donationId is set, load it.
    let donation = locked.donation;
    if (!donation && locked.donationId) {
      donation = await tx.donation.findUnique({ where: { id: locked.donationId } });
    }

    const donationDone = !donation || donation.reversedAt != null;
    const tipDone = !locked.platformTip || locked.platformTip.reversedAt != null;
    if (locked.reversedAt && donationDone && tipDone) {
      return 'already' as const;
    }

    // Reverse the donation ledger first (campaign + transaction status).
    if (donation && donation.reversedAt == null) {
      await reverseDonationOnLedger(tx, donation, { reason, now });
    }

    // Then tip (never fail the whole reversal if tip stats are missing).
    if (locked.platformTip && locked.platformTip.reversedAt == null) {
      const claimedTip = await tx.platformTip.updateMany({
        where: { id: locked.platformTip.id, reversedAt: null },
        data: { reversedAt: now }
      });
      if (claimedTip.count === 1) {
        await ensurePlatformStatRow(tx);
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

    if (!locked.reversedAt) {
      await tx.easypayPaymentIntent.update({
        where: { id: locked.id },
        data: { reversedAt: now }
      });
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
