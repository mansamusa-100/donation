import type { Currency, Prisma } from '@prisma/client';
import { donationPlatformFeeFromGross } from '../config/fees.js';

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
      easypayPaymentIntentId: params.easypayPaymentIntentId ?? undefined
    }
  });

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

  await tx.platformStat.update({
    where: { id: 'platform' },
    data: {
      totalRaised: { increment: params.amount },
      totalDonors: { increment: 1 }
    }
  });

  return donation;
}
