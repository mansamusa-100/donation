import type { Category, Donation, Prisma } from '@prisma/client';
import { computeDaysLeftFromEndsAt } from './campaignEndsAt.js';
import { roundMoney } from './money.js';

const categoryIconByCategory: Record<Category, string> = {
  Medical: 'HeartPulseIcon',
  Education: 'GraduationCapIcon',
  Business: 'StoreIcon',
  Community: 'UsersIcon',
  Emergency: 'AlertTriangleIcon',
  Other: 'MoreHorizontalIcon'
};

type CampaignWithDonations = Prisma.CampaignGetPayload<{
  include: { donations: true };
}>;

function formatRelativeTime(date: Date) {
  const diffMs = Date.now() - date.getTime();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < hour) {
    const minutes = Math.max(1, Math.floor(diffMs / minute));
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }

  if (diffMs < day) {
    const hours = Math.max(1, Math.floor(diffMs / hour));
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }

  const days = Math.max(1, Math.floor(diffMs / day));
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export function serializeDonation(donation: Donation) {
  return {
    id: donation.id,
    name: donation.donorName,
    amount: roundMoney(donation.amount),
    currency: donation.currency,
    timeAgo: formatRelativeTime(donation.createdAt),
    message: donation.message ?? undefined,
    isAnonymous: donation.isAnonymous,
    avatarUrl: donation.avatarUrl ?? undefined
  };
}

export function serializeCampaign(
  campaign: CampaignWithDonations,
  options?: { includePrivateContact?: boolean }
) {
  const showPublic = Boolean(campaign.showPublicContact);
  const revealContact = showPublic || Boolean(options?.includePrivateContact);

  return {
    id: campaign.id,
    slug: campaign.slug,
    title: campaign.title,
    creatorName: campaign.creatorName,
    creatorAvatar: campaign.creatorAvatar,
    category: campaign.category,
    shortDescription: campaign.shortDescription,
    fullDescription: campaign.fullDescription,
    goalAmount: campaign.goalAmount,
    raisedAmount: roundMoney(campaign.raisedAmount),
    donorCount: campaign.donorCount,
    endsAt: campaign.endsAt.toISOString(),
    daysLeft: computeDaysLeftFromEndsAt(campaign.endsAt),
    coverImage: campaign.coverImage,
    galleryImages: campaign.galleryImages ?? [],
    isTrending: campaign.isTrending,
    status: campaign.status,
    createdAt: campaign.createdAt.toISOString(),
    showPublicContact: showPublic,
    contactPhone: revealContact ? campaign.contactPhone ?? null : null,
    contactWhatsApp: revealContact ? campaign.contactWhatsApp ?? null : null,
    recentDonors: campaign.donations
      .filter((d: Donation) => d.reversedAt == null)
      .sort((a: Donation, b: Donation) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(serializeDonation)
  };
}

export function serializeCategorySummaries(
  counts: Partial<Record<Category, number>>
) {
  return (Object.keys(categoryIconByCategory) as Category[]).map((category) => ({
    name: category,
    icon: categoryIconByCategory[category],
    count: counts[category] ?? 0
  }));
}
