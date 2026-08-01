import type { Campaign } from '@prisma/client';
import { HttpError } from './HttpError.js';
import {
  canAcceptDonations,
  getCampaignWithdrawalBalances,
  type CampaignWithdrawalBalances
} from './campaignLifecycle.js';
import { prisma } from './prisma.js';

export async function assertCampaignAcceptsDonations(
  campaign: Campaign
): Promise<CampaignWithdrawalBalances> {
  if (campaign.status !== 'Active') {
    throw new HttpError(
      400,
      'This campaign is not accepting donations. Only active campaigns can receive donations.'
    );
  }

  const balances = await getCampaignWithdrawalBalances(
    prisma,
    campaign.id,
    campaign.raisedAmount
  );

  if (!canAcceptDonations(campaign, balances)) {
    throw new HttpError(
      400,
      campaign.ownerConfirmedEndAt != null
        ? 'The organizer has ended fundraising for this campaign. New donations are no longer accepted.'
        : 'This campaign has ended and is no longer accepting donations.'
    );
  }

  return balances;
}
