import type { WithdrawalPayoutInfo } from './payout';

export type AdminCampaignStatus =
  | 'Draft'
  | 'PendingReview'
  | 'Active'
  | 'Closed'
  | 'Ended'
  | 'Rejected';

export interface AdminExtensionRequestRow {
  id: string;
  campaignId: string;
  campaignTitle: string;
  campaignSlug: string;
  currentEndsAt: string;
  requestedEndDate: string;
  requestedEndsAt: string;
  reason: string | null;
  status: string;
  requestedBy: { id: string; fullName: string; email: string };
  createdAt: string;
}

export interface AdminContentRevisionRow {
  id: string;
  campaignId: string;
  campaignSlug: string;
  campaignStatus: string;
  reason: string | null;
  status: string;
  requestedBy: { id: string; fullName: string; email: string };
  createdAt: string;
  current: {
    title: string;
    shortDescription: string;
    fullDescription: string;
    category: string;
    goalAmount: number;
    coverImage: string;
    galleryImages: string[];
    raisedAmount: number;
  };
  proposed: {
    title: string;
    shortDescription: string;
    fullDescription: string;
    category: string;
    goalAmount: number;
    coverImage: string;
    galleryImages: string[];
  };
}

export interface AdminCampaignCreator {
  id: string;
  fullName: string;
  email: string;
  phoneNumber?: string | null;
  kycStatus?: 'Unverified' | 'Pending' | 'Verified' | 'Rejected';
  hasKycDocument?: boolean;
}

export interface AdminCampaign {
  id: string;
  slug: string;
  title: string;
  creatorName: string;
  creatorAvatar?: string | null;
  category: string;
  shortDescription: string;
  fullDescription: string;
  goalAmount: number;
  raisedAmount: number;
  donorCount: number;
  daysLeft: number;
  endsAt?: string;
  coverImage: string;
  /** Extra photos after cover; omit or empty for cover-only campaigns. */
  galleryImages?: string[];
  verificationDocumentUrl?: string | null;
  termsAcceptedAt?: string | null;
  isTrending: boolean;
  showPublicContact?: boolean;
  contactPhone?: string | null;
  contactWhatsApp?: string | null;
  status: AdminCampaignStatus;
  availableForWithdrawal?: number;
  donationPlatformFeeTotal?: number;
  netRaisedAmount?: number;
  lastDonationAt?: string | null;
  inactive60Days?: boolean;
  creatorId: string | null;
  createdAt: string;
  updatedAt: string;
  creator: AdminCampaignCreator | null;
}

export interface AdminDashboardStats {
  campaigns: { total: number; active: number; pending: number };
  users: { total: number; admins: number };
  donations: number;
  platformStats: {
    id: string;
    totalRaised: number;
    campaignsFunded: number;
    totalDonors: number;
    communitiesHelped: number;
    totalPlatformTips: number;
    updatedAt: string;
  } | null;
  fees?: {
    totalDonationPlatformFees: number;
    totalWithdrawalProcessingFees: number;
  };
}

export interface AdminUserRow {
  id: string;
  email: string;
  fullName: string;
  phoneNumber?: string | null;
  role: 'ADMIN' | 'USER';
  isActive: boolean;
  createdAt: string;
  kycStatus: 'Unverified' | 'Pending' | 'Verified' | 'Rejected';
  hasKycDocument: boolean;
  kycSubmittedAt?: string | null;
  kycReviewedAt?: string | null;
  _count: { campaigns: number; donations: number };
}

export interface AdminUserDetail extends AdminUserRow {
  emailVerified: boolean;
  kycNotes: string | null;
  kycReviewer: { id: string; fullName: string; email: string } | null;
  campaigns: Array<{
    id: string;
    slug: string;
    title: string;
    status: string;
    raisedAmount: number;
    hasVerificationDocument: boolean;
    createdAt: string;
  }>;
  _count: { campaigns: number; donations: number; withdrawalRequests: number };
}

export interface AdminActivityItem {
  id: string;
  type: string;
  title: string;
  detail: string | null;
  campaignId: string | null;
  userId: string | null;
  actorId: string | null;
  createdAt: string;
}

export type AdminPanelKey =
  | 'overview'
  | 'queue'
  | 'campaigns'
  | 'withdrawals'
  | 'users'
  | 'admins'
  | 'easypay'
  | 'bank'
  | 'donations'
  | 'audit';

export type AdminDonationCheckoutMethod = 'wave' | 'easypay' | 'bank' | 'direct';

export type AdminDonationTransactionStatus = 'completed' | 'reversed';

export interface AdminDonationTransactionRow {
  id: string;
  createdAt: string;
  status: AdminDonationTransactionStatus;
  reversedAt: string | null;
  reversalReason: string | null;
  donorDisplayName: string;
  isAnonymous: boolean;
  amount: number;
  platformFeeAmount: number;
  platformTipAmount: number;
  currency: string;
  message: string | null;
  checkoutMethod: AdminDonationCheckoutMethod;
  checkoutLabel: string;
  paymentReference: string | null;
  easypayGatewayCode: string | null;
  campaign: { id: string; title: string; slug: string };
  user: { id: string; fullName: string; email: string } | null;
}

/** Known event types stored in ActivityLog (extend as you add recordActivity calls). */
export const AUDIT_EVENT_TYPES = [
  'CAMPAIGN_SUBMITTED',
  'CAMPAIGN_STATUS_CHANGED',
  'USER_STATUS_CHANGED',
  'USER_KYC_CHANGED',
  'USER_KYC_VIEWED',
  'WITHDRAWAL_REQUESTED',
  'WITHDRAWAL_STATUS_CHANGED',
  'ADMIN_ACCOUNT_CREATED',
  'ADMIN_ACCOUNT_PROMOTED',
  'ADMIN_ACCOUNT_DEMOTED',
  'ADMIN_PERMISSIONS_CHANGED',
  'EASYPAY_PROVISION',
  'BANK_TRANSFER_CONFIRMED',
  'BANK_TRANSFER_REJECTED',
  'DONATION_REVERSED',
  'USER_ACCOUNT_CLOSED'
] as const;

export interface AdminAuditLogItem extends AdminActivityItem {
  actor: { id: string; email: string; fullName: string } | null;
}

export interface AdminPaged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminNotificationItem {
  id: 'campaign_reviews' | 'content_revisions' | 'extension_requests' | 'withdrawals' | 'bank_transfers';
  label: string;
  count: number;
  tab: AdminPanelKey;
}

export interface AdminNotificationSummary {
  total: number;
  items: AdminNotificationItem[];
}

export interface AdminAccountRow {
  id: string;
  email: string;
  fullName: string;
  phoneNumber?: string | null;
  isActive: boolean;
  adminPanelPermissions: string[];
  createdAt: string;
  accessScope: 'full' | 'limited';
  /** True when this row is the OWNER_EMAIL bootstrap account. */
  isPlatformOwner?: boolean;
}

export type AdminWithdrawalStatus = 'Pending' | 'Approved' | 'Rejected' | 'Paid';

export interface AdminWithdrawalRequestRow extends WithdrawalPayoutInfo {
  id: string;
  campaignId: string;
  userId: string;
  amount: number;
  processingFeeAmount: number;
  netAmount: number;
  currency: string;
  status: AdminWithdrawalStatus;
  note: string | null;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
  campaign: {
    id: string;
    title: string;
    slug: string;
    raisedAmount: number;
    status: string;
  };
  user: {
    id: string;
    fullName: string;
    email: string;
    phoneNumber?: string | null;
    kycStatus?: 'Unverified' | 'Pending' | 'Verified' | 'Rejected';
    hasKycDocument?: boolean;
  };
}
