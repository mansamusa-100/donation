import type { WithdrawalPayoutInfo } from './payout';
import type { BankTransferIntentRow } from './bank';

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
  | 'Ended'
  | 'Rejected';

export interface CampaignLifecycleMeta {
  fundraisingPeriodEnded: boolean;
  acceptingDonations: boolean;
  fullyEnded: boolean;
  ownerConfirmedEndAt: string | null;
  endedAt: string | null;
  allFundsPaidOut: boolean;
  grossRaisedAmount: number;
  donationPlatformFeeTotal: number;
  netRaisedAmount: number;
  paidWithdrawalTotal: number;
  availableForWithdrawal: number;
  canConfirmEnd: boolean;
  lastDonationAt?: string | null;
  inactive60Days?: boolean;
  pendingExtension?: {
    id: string;
    requestedEndDate: string;
    status: string;
  } | null;
  pendingContentRevision?: {
    id: string;
    status: string;
    createdAt: string;
  } | null;
}

export interface CampaignExtensionRequestSummary {
  id: string;
  campaignId: string;
  requestedEndDate: string;
  status: string;
  reason: string | null;
  createdAt: string;
}

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
  creatorAvatar?: string | null;
  category: Category;
  shortDescription: string;
  fullDescription: string;
  goalAmount: number;
  raisedAmount: number;
  donorCount: number;
  daysLeft: number;
  /** ISO 8601 — authoritative deadline; `daysLeft` is derived from this on each response. */
  endsAt?: string;
  coverImage: string;
  /** Up to 4 extra photos; with cover, max 5 images per campaign. */
  galleryImages?: string[];
  isTrending?: boolean;
  status?: CampaignStatus;
  createdAt?: string;
  /** Organizer opted to show inquiry phone / WhatsApp on the public page. */
  showPublicContact?: boolean;
  contactPhone?: string | null;
  contactWhatsApp?: string | null;
  recentDonors: Donor[];
  /** Present on creator dashboard / detail when lifecycle fields are included. */
  availableForWithdrawal?: number;
  grossRaisedAmount?: number;
  donationPlatformFeeTotal?: number;
  netRaisedAmount?: number;
  fundraisingPeriodEnded?: boolean;
  acceptingDonations?: boolean;
  fullyEnded?: boolean;
  ownerConfirmedEndAt?: string | null;
  endedAt?: string | null;
  allFundsPaidOut?: boolean;
  canConfirmEnd?: boolean;
  pendingExtension?: CampaignLifecycleMeta['pendingExtension'];
  pendingContentRevision?: CampaignLifecycleMeta['pendingContentRevision'];
}

export type WithdrawalRequestStatus =
  | 'Pending'
  | 'Approved'
  | 'Rejected'
  | 'Paid';

export interface CreatorWithdrawalRequest extends WithdrawalPayoutInfo {
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
  /** Bank transfers you started (by account or matching email). */
  bankTransfers: BankTransferIntentRow[];
  withdrawalRequests: CreatorWithdrawalRequest[];
  totals: {
    totalRaised: number;
    totalDonors: number;
    /** Sum of amounts for donationsMade (same currency mix not split). */
    totalGiven: number;
  };
}
