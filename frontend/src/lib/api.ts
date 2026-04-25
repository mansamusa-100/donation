import type {
  Campaign,
  Category,
  CategorySummary,
  CreatorDashboardOverview,
  CreatorWithdrawalRequest,
  PlatformStats } from
'../types/campaign';
import type {
  AdminAccountRow,
  AdminActivityItem,
  AdminCampaign,
  AdminDashboardStats,
  AdminUserRow,
  AdminWithdrawalRequestRow
} from '../types/admin';
import type { User } from '../types/user';

type CampaignSortOption = 'trending' | 'newest' | 'funded';

interface ApiCreateCampaignInput {
  title: string;
  creatorName: string;
  creatorAvatar?: string;
  category: Category;
  shortDescription: string;
  fullDescription: string;
  goalAmount: number;
  daysLeft: number;
  coverImage: string;
  verificationDocumentUrl: string;
  /** ISO 8601 datetime when the organizer accepted the fee terms */
  termsAcceptedAt: string;
}

interface ApiCreateDonationInput {
  donorName?: string;
  amount: number;
  /** Voluntary platform tip (same currency), recorded separately from the campaign donation. */
  platformTipAmount?: number;
  currency?: 'GMD' | 'USD';
  message?: string;
  isAnonymous?: boolean;
  avatarUrl?: string;
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

async function request<T>(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  const isFormData = init?.body instanceof FormData;
  if (!isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (authToken) {
    headers.set('Authorization', `Bearer ${authToken}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function requestBlob(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  if (authToken) {
    headers.set('Authorization', `Bearer ${authToken}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Request failed with status ${response.status}`);
  }

  return response.blob();
}

export function getCurrentUser() {
  return request<User>('/api/auth/me');
}

export const api = {
  requestPasswordReset(email: string) {
    return request<{ message: string }>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email })
    });
  },

  resetPasswordWithToken(token: string, password: string) {
    return request<{ message: string }>('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password })
    });
  },

  getStats() {
    return request<PlatformStats>('/api/stats');
  },

  getCategories() {
    return request<CategorySummary[]>('/api/categories');
  },

  getCampaigns(params?: {
    search?: string;
    category?: Category;
    sort?: CampaignSortOption;
  }) {
    const searchParams = new URLSearchParams();

    if (params?.search) {
      searchParams.set('search', params.search);
    }

    if (params?.category) {
      searchParams.set('category', params.category);
    }

    if (params?.sort) {
      searchParams.set('sort', params.sort);
    }

    const query = searchParams.toString();
    return request<Campaign[]>(`/api/campaigns${query ? `?${query}` : ''}`);
  },

  getCampaignBySlug(slug: string) {
    return request<Campaign>(`/api/campaigns/${encodeURIComponent(slug)}`);
  },

  getCreatorDashboard() {
    return request<CreatorDashboardOverview>('/api/campaigns/mine/overview');
  },

  createWithdrawalRequest(payload: {
    campaignSlug: string;
    amount: number;
    note?: string;
  }) {
    return request<CreatorWithdrawalRequest>('/api/campaigns/withdrawal-requests', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  createCampaign(payload: ApiCreateCampaignInput) {
    return request<Campaign>('/api/campaigns', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  uploadCampaignCoverImage(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    const headers = new Headers();
    if (authToken) {
      headers.set('Authorization', `Bearer ${authToken}`);
    }
    return request<{ url: string }>('/api/uploads/campaign-cover', {
      method: 'POST',
      body: formData,
      headers
    });
  },

  uploadVerificationId(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    const headers = new Headers();
    if (authToken) {
      headers.set('Authorization', `Bearer ${authToken}`);
    }
    return request<{ url: string }>('/api/uploads/verification-id', {
      method: 'POST',
      body: formData,
      headers
    });
  },

  getAdminVerificationDocumentBlob(campaignId: string) {
    return requestBlob(
      `/api/admin/campaigns/${encodeURIComponent(campaignId)}/verification-document`
    );
  },

  createDonation(slug: string, payload: ApiCreateDonationInput) {
    return request<Campaign>(`/api/campaigns/${slug}/donations`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  getPaymentProviders() {
    return request<{
      providers: Array<{
        id: 'wave' | 'aps' | 'yonna';
        label: string;
        configured: boolean;
        checkoutLive: boolean;
      }>;
    }>('/api/payments/providers');
  },

  createWaveCheckoutSession(payload: {
    campaignSlug: string;
    amount: number;
    platformTipAmount?: number;
    currency?: 'GMD' | 'USD';
    donorName?: string;
    message?: string;
    isAnonymous?: boolean;
    avatarUrl?: string;
  }) {
    return request<{
      clientReference: string;
      waveSessionId: string;
      waveLaunchUrl: string;
      checkoutStatus: string;
      paymentStatus: string;
      campaignDonationAmount: number;
      platformTipAmount: number;
      waveChargeTotal: number;
    }>('/api/payments/wave/session', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  confirmWavePayment(clientReference: string) {
    return request<
      | {
          status: 'succeeded';
          campaign: Campaign | null;
          campaignDonationAmount: number;
          platformTipAmount: number;
          waveChargeTotal: number;
        }
      | {
          status: 'already_completed';
          campaign: Campaign | null;
          campaignDonationAmount: number;
          platformTipAmount: number;
          waveChargeTotal: number;
        }
      | {
          status: 'pending';
          checkoutStatus: string;
          paymentStatus: string;
          waveSessionId: string;
          campaignDonationAmount: number;
          platformTipAmount: number;
          waveChargeTotal: number;
        }
    >('/api/payments/wave/confirm', {
      method: 'POST',
      body: JSON.stringify({ clientReference })
    });
  },

  getAdminStats() {
    return request<AdminDashboardStats>('/api/admin/stats');
  },

  getAdminActivity() {
    return request<AdminActivityItem[]>('/api/admin/activity');
  },

  getAdminPendingCampaigns() {
    return request<AdminCampaign[]>('/api/admin/campaigns/pending');
  },

  getAdminCampaigns() {
    return request<AdminCampaign[]>('/api/admin/campaigns');
  },

  updateAdminCampaignStatus(
    campaignId: string,
    status: 'Active' | 'Rejected' | 'Closed'
  ) {
    return request<{ message: string; campaign: AdminCampaign }>(
      `/api/admin/campaigns/${campaignId}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status })
      }
    );
  },

  getAdminUsers() {
    return request<AdminUserRow[]>('/api/admin/users');
  },

  updateAdminUserStatus(userId: string, isActive: boolean) {
    return request<{
      message: string;
      user: Pick<AdminUserRow, 'id' | 'email' | 'fullName' | 'isActive' | 'role'>;
    }>(`/api/admin/users/${userId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive })
    });
  },

  getAdminWithdrawalRequests() {
    return request<AdminWithdrawalRequestRow[]>('/api/admin/withdrawal-requests');
  },

  updateAdminWithdrawalRequest(
    requestId: string,
    payload: { status: 'Approved' | 'Rejected' | 'Paid'; adminNote?: string }
  ) {
    return request<AdminWithdrawalRequestRow>(
      `/api/admin/withdrawal-requests/${encodeURIComponent(requestId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload)
      }
    );
  },

  getAdminAccounts() {
    return request<AdminAccountRow[]>('/api/admin/accounts');
  },

  createAdminAccount(payload: {
    email: string;
    password: string;
    fullName: string;
    phoneNumber?: string;
    adminPanelPermissions: string[];
  }) {
    return request<{
      id: string;
      email: string;
      fullName: string;
      phoneNumber?: string | null;
      role: string;
      adminPanelPermissions: string[];
    }>('/api/admin/accounts', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  updateAdminAccountPermissions(userId: string, adminPanelPermissions: string[]) {
    return request<{
      id: string;
      email: string;
      fullName: string;
      adminPanelPermissions: string[];
    }>(`/api/admin/accounts/${encodeURIComponent(userId)}/permissions`, {
      method: 'PATCH',
      body: JSON.stringify({ adminPanelPermissions })
    });
  }
};
