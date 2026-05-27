import type { Campaign, CampaignStatus, Prisma, WithdrawalRequestStatus } from '@prisma/client';
import { isCampaignDonationWindowOpen } from './campaignEndsAt.js';

const MS_PER_DAY = 86_400_000;

export const CAMPAIGN_INACTIVITY_DAYS = 60;

export type CampaignWithdrawalBalances = {
  grossRaisedAmount: number;
  donationPlatformFeeTotal: number;
  netRaisedAmount: number;
  paidTotal: number;
  committedTotal: number;
  availableForWithdrawal: number;
  allFundsPaidOut: boolean;
};

const COMMITTED_STATUSES: WithdrawalRequestStatus[] = ['Pending', 'Approved', 'Paid'];

type WithdrawalBalanceDb = {
  donation: {
    aggregate: (args: {
      where: Prisma.DonationWhereInput;
      _sum: { platformFeeAmount: true };
    }) => Promise<{ _sum: { platformFeeAmount: number | null } }>;
  };
  withdrawalRequest: {
    aggregate: (args: {
      where: Prisma.WithdrawalRequestWhereInput;
      _sum: { amount: true };
    }) => Promise<{ _sum: { amount: number | null } }>;
  };
};

export async function getCampaignWithdrawalBalances(
  db: WithdrawalBalanceDb,
  campaignId: string,
  grossRaisedAmount: number
): Promise<CampaignWithdrawalBalances> {
  const [donationFeeAgg, paidAgg, committedAgg] = await Promise.all([
    db.donation.aggregate({
      where: { campaignId },
      _sum: { platformFeeAmount: true }
    }),
    db.withdrawalRequest.aggregate({
      where: { campaignId, status: 'Paid' },
      _sum: { amount: true }
    }),
    db.withdrawalRequest.aggregate({
      where: { campaignId, status: { in: COMMITTED_STATUSES } },
      _sum: { amount: true }
    })
  ]);

  const donationPlatformFeeTotal = donationFeeAgg._sum.platformFeeAmount ?? 0;
  const netRaisedAmount = Math.max(0, grossRaisedAmount - donationPlatformFeeTotal);
  const paidTotal = paidAgg._sum.amount ?? 0;
  const committedTotal = committedAgg._sum.amount ?? 0;
  const availableForWithdrawal = Math.max(0, netRaisedAmount - committedTotal);
  const allFundsPaidOut = paidTotal >= netRaisedAmount;

  return {
    grossRaisedAmount,
    donationPlatformFeeTotal,
    netRaisedAmount,
    paidTotal,
    committedTotal,
    availableForWithdrawal,
    allFundsPaidOut
  };
}

export function isFundraisingPeriodEnded(endsAt: Date, now = new Date()): boolean {
  return !isCampaignDonationWindowOpen(endsAt, now);
}

export function isCampaignFullyEnded(
  campaign: Pick<Campaign, 'status' | 'ownerConfirmedEndAt' | 'raisedAmount'>,
  balances: CampaignWithdrawalBalances
): boolean {
  if (campaign.status === 'Ended') {
    return true;
  }
  return (
    campaign.ownerConfirmedEndAt != null &&
    balances.allFundsPaidOut &&
    campaign.raisedAmount >= 0
  );
}

export function canAcceptDonations(
  campaign: Pick<Campaign, 'status' | 'endsAt' | 'ownerConfirmedEndAt' | 'raisedAmount'>,
  balances: CampaignWithdrawalBalances
): boolean {
  if (campaign.status !== 'Active') {
    return false;
  }
  return !isCampaignFullyEnded(campaign, balances);
}

export function canRequestWithdrawal(status: CampaignStatus): boolean {
  return status === 'Active' || status === 'Closed';
}

export function canOwnerConfirmEnd(
  campaign: Pick<Campaign, 'status' | 'ownerConfirmedEndAt'>
): boolean {
  return campaign.status === 'Active' && campaign.ownerConfirmedEndAt == null;
}

export function isInactiveForAdminEnd(
  lastDonationAt: Date | null,
  campaignCreatedAt: Date,
  now = new Date()
): boolean {
  const reference = lastDonationAt ?? campaignCreatedAt;
  return now.getTime() - reference.getTime() >= CAMPAIGN_INACTIVITY_DAYS * MS_PER_DAY;
}

export async function getLastDonationAt(
  db: {
    donation: {
      findFirst: (args: {
        where: { campaignId: string };
        orderBy: { createdAt: 'desc' };
        select: { createdAt: true };
      }) => Promise<{ createdAt: Date } | null>;
    };
  },
  campaignId: string
): Promise<Date | null> {
  const row = await db.donation.findFirst({
    where: { campaignId },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true }
  });
  return row?.createdAt ?? null;
}

export async function tryFinalizeCampaignEnded(
  tx: Prisma.TransactionClient,
  campaignId: string
): Promise<boolean> {
  const campaign = await tx.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.status !== 'Active' || !campaign.ownerConfirmedEndAt) {
    return false;
  }

  const balances = await getCampaignWithdrawalBalances(tx, campaignId, campaign.raisedAmount);
  if (!balances.allFundsPaidOut) {
    return false;
  }

  await tx.campaign.update({
    where: { id: campaignId },
    data: {
      status: 'Ended',
      endedAt: new Date()
    }
  });
  return true;
}

export function buildCampaignLifecycleMeta(
  campaign: Pick<
    Campaign,
    'status' | 'endsAt' | 'ownerConfirmedEndAt' | 'raisedAmount' | 'endedAt'
  >,
  balances: CampaignWithdrawalBalances,
  extras?: {
    lastDonationAt?: string | null;
    inactive60Days?: boolean;
    pendingExtension?: { id: string; requestedEndDate: string; status: string } | null;
  }
) {
  const fundraisingPeriodEnded = isFundraisingPeriodEnded(campaign.endsAt);
  const acceptingDonations = canAcceptDonations(campaign, balances);
  const fullyEnded = isCampaignFullyEnded(campaign, balances);

  return {
    fundraisingPeriodEnded,
    acceptingDonations,
    fullyEnded,
    ownerConfirmedEndAt: campaign.ownerConfirmedEndAt?.toISOString() ?? null,
    endedAt: campaign.endedAt?.toISOString() ?? null,
    allFundsPaidOut: balances.allFundsPaidOut,
    grossRaisedAmount: balances.grossRaisedAmount,
    donationPlatformFeeTotal: balances.donationPlatformFeeTotal,
    netRaisedAmount: balances.netRaisedAmount,
    paidWithdrawalTotal: balances.paidTotal,
    availableForWithdrawal: balances.availableForWithdrawal,
    canConfirmEnd: canOwnerConfirmEnd(campaign),
    lastDonationAt: extras?.lastDonationAt ?? null,
    inactive60Days: extras?.inactive60Days ?? false,
    pendingExtension: extras?.pendingExtension ?? null
  };
}
