export type Category =
  | 'Medical'
  | 'Education'
  | 'Business'
  | 'Community'
  | 'Emergency'
  | 'Other';

export type CategoryIconName =
  | 'HeartPulseIcon'
  | 'GraduationCapIcon'
  | 'StoreIcon'
  | 'UsersIcon'
  | 'AlertTriangleIcon'
  | 'MoreHorizontalIcon';

export type CampaignStatus =
  | 'Draft'
  | 'PendingReview'
  | 'Active'
  | 'Closed'
  | 'Rejected';

export interface CategorySummary {
  name: Category;
  icon: CategoryIconName;
  count: number;
}

export interface PlatformStats {
  totalRaised: number;
  campaignsFunded: number;
  totalDonors: number;
  communitiesHelped: number;
}

export interface Donor {
  id: string;
  name: string;
  amount: number;
  currency: string;
  timeAgo: string;
  message?: string;
  isAnonymous: boolean;
  avatarUrl?: string;
}

export interface Campaign {
  id: string;
  slug: string;
  title: string;
  creatorName: string;
  creatorAvatar: string;
  category: Category;
  shortDescription: string;
  fullDescription: string;
  goalAmount: number;
  raisedAmount: number;
  donorCount: number;
  daysLeft: number;
  coverImage: string;
  isTrending?: boolean;
  status?: CampaignStatus;
  createdAt?: string;
  recentDonors: Donor[];
  /** Present on creator dashboard: raised balance not yet tied up in withdrawal requests. */
  availableForWithdrawal?: number;
}

export type WithdrawalRequestStatus =
  | 'Pending'
  | 'Approved'
  | 'Rejected'
  | 'Paid';

export interface CreatorWithdrawalRequest {
  id: string;
  campaignId: string;
  campaignTitle: string;
  campaignSlug: string;
  amount: number;
  processingFeeAmount: number;
  netAmount: number;
  currency: string;
  status: WithdrawalRequestStatus;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatorReceivedDonation {
  id: string;
  name: string;
  amount: number;
  currency: string;
  timeAgo: string;
  campaignTitle: string;
  campaignSlug: string;
}

export interface CreatorDashboardOverview {
  campaigns: Campaign[];
  recentDonations: CreatorReceivedDonation[];
  /** Donations you made while signed in (non-anonymous); linked via userId. */
  donationsMade: CreatorReceivedDonation[];
  withdrawalRequests: CreatorWithdrawalRequest[];
  totals: {
    totalRaised: number;
    totalDonors: number;
    /** Sum of amounts for donationsMade (same currency mix not split). */
    totalGiven: number;
  };
}
