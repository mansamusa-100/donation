import type { Currency, Prisma } from '@prisma/client';
import { donationPlatformFeeFromGross } from '../config/fees.js';

async function ensurePlatformStatRow(tx: Prisma.TransactionClient): Promise<void> {
  await tx.platformStat.upsert({
    where: { id: 'platform' },
    create: {
      id: 'platform',
      totalRaised: 0,
      campaignsFunded: 0,
      totalDonors: 0,
      communitiesHelped: 0,
      totalPlatformTips: 0
    },
    update: {}
  });
}

/** Records a voluntary platform tip and increments aggregate stats (not campaign raised). */
export async function recordPlatformTip(
  tx: Prisma.TransactionClient,
  params: {
    amount: number;
    currency: Currency;
    donorName: string;
    userId?: string | null;
    campaignId?: string | null;
    wavePaymentIntentId?: string | null;
    easypayPaymentIntentId?: string | null;
    bankTransferIntentId?: string | null;
  }
) {
  if (params.amount <= 0) {
    return null;
  }

  const tip = await tx.platformTip.create({
    data: {
      amount: params.amount,
      currency: params.currency,
      donorName: params.donorName,
      userId: params.userId ?? undefined,
      campaignId: params.campaignId ?? undefined,
      wavePaymentIntentId: params.wavePaymentIntentId ?? undefined,
      easypayPaymentIntentId: params.easypayPaymentIntentId ?? undefined,
      bankTransferIntentId: params.bankTransferIntentId ?? undefined
    }
  });

  await ensurePlatformStatRow(tx);
  await tx.platformStat.update({
    where: { id: 'platform' },
    data: {
      totalPlatformTips: { increment: params.amount }
    }
  });

  return tip;
}

export async function applyDonationToLedger(
  tx: Prisma.TransactionClient,
  params: {
    campaignId: string;
    campaignSlug: string;
    userId?: string | null;
    donorName: string;
    amount: number;
    currency: Currency;
    message?: string | null;
    isAnonymous: boolean;
    avatarUrl?: string | null;
  }
) {
  const platformFeeAmount = donationPlatformFeeFromGross(params.amount);

  const donation = await tx.donation.create({
    data: {
      campaignId: params.campaignId,
      userId: params.userId ?? undefined,
      donorName: params.donorName,
      amount: params.amount,
      platformFeeAmount,
      currency: params.currency,
      message: params.message ?? undefined,
      isAnonymous: params.isAnonymous,
      avatarUrl: params.avatarUrl ?? undefined
    }
  });

  await tx.campaign.update({
    where: { slug: params.campaignSlug },
    data: {
      raisedAmount: { increment: params.amount },
      donorCount: { increment: 1 }
    }
  });

  await ensurePlatformStatRow(tx);
  await tx.platformStat.update({
    where: { id: 'platform' },
    data: {
      totalRaised: { increment: params.amount },
      totalDonors: { increment: 1 }
    }
  });

  return donation;
}

/** Stamp a donation as reversed without touching campaign/platform totals. */
export async function markDonationReversed(
  tx: Prisma.TransactionClient,
  donationId: string,
  params: { reason?: string | null; now?: Date }
): Promise<'reversed' | 'already_reversed'> {
  const now = params.now ?? new Date();
  const claimed = await tx.donation.updateMany({
    where: { id: donationId, reversedAt: null },
    data: {
      reversedAt: now,
      reversalReason: params.reason ?? undefined
    }
  });
  return claimed.count === 1 ? 'reversed' : 'already_reversed';
}

/**
 * True when campaign raised already excludes this donation (ledger already unwound).
 * Used to repair rows where totals dropped but `reversedAt` was never stamped.
 */
export async function campaignRaisedAlreadyExcludesDonation(
  tx: Prisma.TransactionClient,
  donation: { id: string; campaignId: string; amount: number }
): Promise<boolean> {
  const [campaign, others] = await Promise.all([
    tx.campaign.findUnique({
      where: { id: donation.campaignId },
      select: { raisedAmount: true }
    }),
    tx.donation.aggregate({
      where: {
        campaignId: donation.campaignId,
        reversedAt: null,
        id: { not: donation.id }
      },
      _sum: { amount: true }
    })
  ]);
  if (!campaign) {
    return false;
  }
  const expectedWithout = others._sum.amount ?? 0;
  return Math.abs(campaign.raisedAmount - expectedWithout) < 0.02;
}

/**
 * Marks a donation reversed and unwinds campaign + platform raised totals.
 * Idempotent: a second call for the same row is a no-op.
 * If totals were already unwound but the row was never stamped, only stamps status.
 */
export async function reverseDonationOnLedger(
  tx: Prisma.TransactionClient,
  donation: { id: string; campaignId: string; amount: number },
  params: { reason?: string | null; now?: Date }
): Promise<'reversed' | 'already_reversed' | 'status_only'> {
  const now = params.now ?? new Date();

  const existing = await tx.donation.findUnique({
    where: { id: donation.id },
    select: { reversedAt: true }
  });
  if (!existing) {
    return 'already_reversed';
  }
  if (existing.reversedAt != null) {
    return 'already_reversed';
  }

  if (await campaignRaisedAlreadyExcludesDonation(tx, donation)) {
    const stamped = await markDonationReversed(tx, donation.id, params);
    return stamped === 'reversed' ? 'status_only' : 'already_reversed';
  }

  const claimed = await markDonationReversed(tx, donation.id, { reason: params.reason, now });
  if (claimed !== 'reversed') {
    return 'already_reversed';
  }

  await tx.campaign.update({
    where: { id: donation.campaignId },
    data: {
      raisedAmount: { decrement: donation.amount },
      donorCount: { decrement: 1 }
    }
  });
  await tx.$executeRaw`
    UPDATE "Campaign"
    SET
      "raisedAmount" = CASE WHEN "raisedAmount" < 0 THEN 0 ELSE "raisedAmount" END,
      "donorCount" = CASE WHEN "donorCount" < 0 THEN 0 ELSE "donorCount" END
    WHERE id = ${donation.campaignId}
  `;

  await ensurePlatformStatRow(tx);
  await tx.platformStat.update({
    where: { id: 'platform' },
    data: {
      totalRaised: { decrement: donation.amount },
      totalDonors: { decrement: 1 }
    }
  });
  await tx.$executeRaw`
    UPDATE "PlatformStat"
    SET
      "totalRaised" = CASE WHEN "totalRaised" < 0 THEN 0 ELSE "totalRaised" END,
      "totalDonors" = CASE WHEN "totalDonors" < 0 THEN 0 ELSE "totalDonors" END
    WHERE id = 'platform'
  `;

  return 'reversed';
}
