export type AdminCampaignStatus =
  | 'Draft'
  | 'PendingReview'
  | 'Active'
  | 'Closed'
  | 'Rejected';

export interface AdminCampaignCreator {
  id: string;
  fullName: string;
  email: string;
  phoneNumber?: string | null;
}

export interface AdminCampaign {
  id: string;
  slug: string;
  title: string;
  creatorName: string;
  creatorAvatar: string;
  category: string;
  shortDescription: string;
  fullDescription: string;
  goalAmount: number;
  raisedAmount: number;
  donorCount: number;
  daysLeft: number;
  coverImage: string;
  verificationDocumentUrl?: string | null;
  termsAcceptedAt?: string | null;
  isTrending: boolean;
  status: AdminCampaignStatus;
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
  _count: { campaigns: number; donations: number };
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

export type AdminWithdrawalStatus = 'Pending' | 'Approved' | 'Rejected' | 'Paid';

export interface AdminWithdrawalRequestRow {
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
  };
}
