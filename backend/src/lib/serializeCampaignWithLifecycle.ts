import type { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';
import {
  buildCampaignLifecycleMeta,
  getCampaignWithdrawalBalances,
  getLastDonationAt,
  isInactiveForAdminEnd
} from './campaignLifecycle.js';
import { serializeCampaign } from './serializers.js';

type CampaignWithDonations = Prisma.CampaignGetPayload<{
  include: { donations: true };
}>;

export async function serializeCampaignWithLifecycle(
  campaign: CampaignWithDonations,
  options?: {
    includeAdminInactive?: boolean;
    includePrivateContact?: boolean;
    pendingExtension?: { id: string; requestedEndDate: string; status: string } | null;
  }
) {
  const balances = await getCampaignWithdrawalBalances(
    prisma,
    campaign.id,
    campaign.raisedAmount
  );

  let lastDonationAt: string | null = null;
  let inactive60Days = false;
  if (options?.includeAdminInactive) {
    const last = await getLastDonationAt(prisma, campaign.id);
    lastDonationAt = last?.toISOString() ?? null;
    inactive60Days = isInactiveForAdminEnd(last, campaign.createdAt);
  }

  return {
    ...serializeCampaign(campaign, {
      includePrivateContact: options?.includePrivateContact
    }),
    ...buildCampaignLifecycleMeta(campaign, balances, {
      lastDonationAt,
      inactive60Days,
      pendingExtension: options?.pendingExtension ?? null
    }),
    availableForWithdrawal: balances.availableForWithdrawal
  };
}
