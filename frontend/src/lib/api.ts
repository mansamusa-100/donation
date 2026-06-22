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
  AdminAuditLogItem,
  AdminCampaign,
  AdminDashboardStats,
  AdminExtensionRequestRow,
  AdminNotificationSummary,
  AdminPaged,
  AdminUserRow,
  AdminWithdrawalRequestRow
} from '../types/admin';
import type { CampaignExtensionRequestSummary } from '../types/campaign';
import type { PayoutMethodType, PayoutDetails, UserPayoutMethod } from '../types/payout';
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
  /** `YYYY-MM-DD` — server stores inclusive end-of UTC day and derives live `daysLeft`. */
  campaignEndDate: string;
  coverImage: string;
  /** Up to 4 URLs (same upload rules as cover); optional. */
  galleryImages?: string[];
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

const defaultFetchInit: RequestInit = {
  credentials: 'include'
};

/** Build optional query string for admin list endpoints */
function adminListQuery(page?: number, pageSize?: number) {
  const p = new URLSearchParams();
  if (page != null) {
    p.set('page', String(page));
  }
  if (pageSize != null) {
    p.set('pageSize', String(pageSize));
  }
  const q = p.toString();
  return q ? `?${q}` : '';
}

function adminAuditQuery(params: {
  page?: number;
  pageSize?: number;
  type?: string;
  from?: string;
  to?: string;
  q?: string;
}) {
  const p = new URLSearchParams();
  if (params.page != null) {
    p.set('page', String(params.page));
  }
  if (params.pageSize != null) {
    p.set('pageSize', String(params.pageSize));
  }
  if (params.type) {
    p.set('type', params.type);
  }
  if (params.from) {
    p.set('from', params.from);
  }
  if (params.to) {
    p.set('to', params.to);
  }
  if (params.q) {
    p.set('q', params.q);
  }
  const q = p.toString();
  return q ? `?${q}` : '';
}

async function request<T>(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  const isFormData = init?.body instanceof FormData;
  if (!isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...defaultFetchInit,
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

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...defaultFetchInit,
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
  login(email: string, password: string) {
    return request<{ user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
  },

  register(email: string, password: string, fullName: string, phoneNumber?: string) {
    return request<{ user: User }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, fullName, phoneNumber })
    });
  },

  loginWithGoogle(credential: string) {
    return request<{ user: User; isNewUser?: boolean }>('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({ credential })
    });
  },

  logout() {
    return request<{ message: string }>('/api/auth/logout', {
      method: 'POST',
      body: JSON.stringify({})
    });
  },

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

  getPayoutMethods() {
    return request<UserPayoutMethod[]>('/api/payout-methods');
  },

  createPayoutMethod(payload: {
    type: PayoutMethodType;
    label?: string;
    isDefault?: boolean;
    details: PayoutDetails;
  }) {
    return request<UserPayoutMethod>('/api/payout-methods', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  updatePayoutMethod(
    id: string,
    payload: { label?: string; isDefault?: boolean; details?: PayoutDetails }
  ) {
    return request<UserPayoutMethod>(`/api/payout-methods/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
  },

  deletePayoutMethod(id: string) {
    return request<{ message: string }>(`/api/payout-methods/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
  },

  createWithdrawalRequest(payload: {
    campaignSlug: string;
    amount: number;
    payoutMethodId: string;
    note?: string;
  }) {
    return request<CreatorWithdrawalRequest>('/api/campaigns/withdrawal-requests', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  confirmCampaignEnd(slug: string) {
    return request<Campaign>(`/api/campaigns/${encodeURIComponent(slug)}/confirm-end`, {
      method: 'POST',
      body: JSON.stringify({})
    });
  },

  requestCampaignExtension(
    slug: string,
    payload: { campaignEndDate: string; reason?: string }
  ) {
    return request<CampaignExtensionRequestSummary>(
      `/api/campaigns/${encodeURIComponent(slug)}/extension-requests`,
      {
        method: 'POST',
        body: JSON.stringify(payload)
      }
    );
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
    return request<{ url: string }>('/api/uploads/campaign-cover', {
      method: 'POST',
      body: formData
    });
  },

  uploadProfilePicture(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    return request<{ url: string }>('/api/uploads/profile-picture', {
      method: 'POST',
      body: formData
    });
  },

  updateMyAvatar(avatarUrl: string | null) {
    return request<{ avatarUrl: string | null }>('/api/auth/me/avatar', {
      method: 'PATCH',
      body: JSON.stringify({ avatarUrl })
    });
  },

  uploadVerificationId(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    return request<{ url: string }>('/api/uploads/verification-id', {
      method: 'POST',
      body: formData
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
      easypayCheckout?: boolean;
      providers: Array<{
        id: 'wave' | 'aps' | 'yonna' | 'bank';
        label: string;
        configured: boolean;
        checkoutLive: boolean;
      }>;
    }>('/api/payments/providers');
  },

  getPlatformBankAccounts() {
    return request<import('../types/bank').PlatformBankAccount[]>('/api/platform-bank-accounts');
  },

  initiateBankTransfer(payload: {
    campaignSlug: string;
    amount: number;
    platformTipAmount?: number;
    currency?: 'GMD' | 'USD';
    donorName?: string;
    message?: string;
    isAnonymous?: boolean;
    avatarUrl?: string;
    platformBankAccountId: string;
  }) {
    return request<import('../types/bank').BankTransferInitiateResult>('/api/bank-transfers/initiate', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  getBankTransferStatus(reference: string) {
    return request<import('../types/bank').BankTransferIntentRow>(
      `/api/bank-transfers/status/${encodeURIComponent(reference)}`
    );
  },

  easypayPartnerCheckout(
    payload: {
      campaignSlug: string;
      amount: number;
      platformTipAmount?: number;
      currency?: 'GMD' | 'USD';
      donorName?: string;
      message?: string;
      isAnonymous?: boolean;
      avatarUrl?: string;
      channel: 'wave' | 'yonna' | 'aps';
      payerPhone?: string;
    }
  ) {
    return request<
      | {
          kind: 'redirect';
          partnerExternalBookingId: string;
          easypayOrderId: string;
          launchUrl: string;
          qrPayload: string;
          paymentHtml?: string | null;
          checkoutAdapter: string;
          campaignDonationAmount: number;
          platformTipAmount: number;
          chargeTotal: number;
        }
      | {
          kind: 'aps';
          partnerExternalBookingId: string;
          easypayOrderId: string;
          gatewayCode: string;
          campaignDonationAmount: number;
          platformTipAmount: number;
          chargeTotal: number;
        }
    >('/api/payments/easypay/checkout', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  getEasypayPaymentStatus(partnerExternalBookingId: string) {
    return request<{
      status: 'succeeded' | 'pending';
      campaign: Campaign | null;
      campaignDonationAmount: number;
      platformTipAmount: number;
      chargeTotal: number;
    }>(
      `/api/payments/easypay/status/${encodeURIComponent(partnerExternalBookingId)}`
    );
  },

  easypayApsAuthorize(payload: { partnerExternalBookingId: string; payerMobile: string }) {
    return request<{
      gatewayCode: string;
      authState: string;
      requiresOtp: boolean;
    }>('/api/payments/easypay/aps/authorize', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  easypayApsComplete(payload: {
    partnerExternalBookingId: string;
    gatewayCode: string;
    authState: string;
    otp?: string;
  }) {
    return request<{ data: Record<string, unknown> }>('/api/payments/easypay/aps/complete', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
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

  getAdminNotificationSummary() {
    return request<AdminNotificationSummary>('/api/admin/notifications/summary');
  },

  getAdminActivity(params?: { page?: number; pageSize?: number }) {
    const q = adminListQuery(params?.page, params?.pageSize);
    return request<AdminPaged<AdminActivityItem>>(`/api/admin/activity${q}`);
  },

  getAdminAudit(params?: {
    page?: number;
    pageSize?: number;
    type?: string;
    from?: string;
    to?: string;
    q?: string;
  }) {
    const q = adminAuditQuery({
      page: params?.page,
      pageSize: params?.pageSize,
      type: params?.type,
      from: params?.from,
      to: params?.to,
      q: params?.q
    });
    return request<AdminPaged<AdminAuditLogItem>>(`/api/admin/audit${q}`);
  },

  exportAdminAuditCsv(params?: { type?: string; from?: string; to?: string; q?: string }) {
    const q = adminAuditQuery({
      type: params?.type,
      from: params?.from,
      to: params?.to,
      q: params?.q
    });
    return requestBlob(`/api/admin/audit/export.csv${q}`);
  },

  getAdminPendingCampaigns(params?: { page?: number; pageSize?: number }) {
    const q = adminListQuery(params?.page, params?.pageSize);
    return request<AdminPaged<AdminCampaign>>(`/api/admin/campaigns/pending${q}`);
  },

  getAdminCampaigns(params?: { page?: number; pageSize?: number }) {
    const q = adminListQuery(params?.page, params?.pageSize);
    return request<AdminPaged<AdminCampaign>>(`/api/admin/campaigns${q}`);
  },

  getAdminUsers(params?: { page?: number; pageSize?: number }) {
    const q = adminListQuery(params?.page, params?.pageSize);
    return request<AdminPaged<AdminUserRow>>(`/api/admin/users${q}`);
  },

  getAdminWithdrawalRequests(params?: { page?: number; pageSize?: number }) {
    const q = adminListQuery(params?.page, params?.pageSize);
    return request<AdminPaged<AdminWithdrawalRequestRow>>(`/api/admin/withdrawal-requests${q}`);
  },

  getAdminPendingExtensionRequests(params?: { page?: number; pageSize?: number }) {
    const q = adminListQuery(params?.page, params?.pageSize);
    return request<AdminPaged<AdminExtensionRequestRow>>(
      `/api/admin/campaigns/extension-requests/pending${q}`
    );
  },

  reviewAdminExtensionRequest(
    requestId: string,
    payload: { status: 'Approved' | 'Rejected'; adminNote?: string }
  ) {
    return request<{ message: string }>(
      `/api/admin/campaigns/extension-requests/${encodeURIComponent(requestId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload)
      }
    );
  },

  endInactiveCampaign(campaignId: string) {
    return request<{ message: string }>(
      `/api/admin/campaigns/${encodeURIComponent(campaignId)}/end-inactive`,
      { method: 'POST', body: JSON.stringify({}) }
    );
  },

  updateAdminCampaignStatus(
    campaignId: string,
    status: 'Active' | 'Rejected' | 'Closed' | 'Ended'
  ) {
    return request<{ message: string; campaign: AdminCampaign }>(
      `/api/admin/campaigns/${campaignId}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status })
      }
    );
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

  updateAdminWithdrawalRequest(
    requestId: string,
    payload: {
      status: 'Approved' | 'Rejected' | 'Paid';
      adminNote?: string;
      payoutReference?: string;
    }
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
  },

  getAdminPlatformBankAccounts() {
    return request<import('../types/bank').PlatformBankAccount[]>('/api/admin/platform-bank-accounts');
  },

  createAdminPlatformBankAccount(payload: {
    label?: string | null;
    accountName: string;
    bankName: string;
    accountNumber: string;
    swiftCode: string;
    bban: string;
    isActive?: boolean;
    sortOrder?: number;
  }) {
    return request<import('../types/bank').PlatformBankAccount>('/api/admin/platform-bank-accounts', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  updateAdminPlatformBankAccount(
    accountId: string,
    payload: Partial<{
      label: string | null;
      accountName: string;
      bankName: string;
      accountNumber: string;
      swiftCode: string;
      bban: string;
      isActive: boolean;
      sortOrder: number;
    }>
  ) {
    return request<import('../types/bank').PlatformBankAccount>(
      `/api/admin/platform-bank-accounts/${encodeURIComponent(accountId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload)
      }
    );
  },

  getAdminBankTransfers(params?: { page?: number; pageSize?: number; status?: string }) {
    const q = new URLSearchParams();
    if (params?.page) {
      q.set('page', String(params.page));
    }
    if (params?.pageSize) {
      q.set('pageSize', String(params.pageSize));
    }
    if (params?.status) {
      q.set('status', params.status);
    }
    const qs = q.toString();
    return request<{
      items: import('../types/bank').BankTransferIntentRow[];
      total: number;
      page: number;
      pageSize: number;
    }>(`/api/admin/bank-transfers${qs ? `?${qs}` : ''}`);
  },

  confirmAdminBankTransfer(
    intentId: string,
    payload: { receivedAmount: number; adminNote?: string }
  ) {
    return request<import('../types/bank').BankTransferIntentRow>(
      `/api/admin/bank-transfers/${encodeURIComponent(intentId)}/confirm`,
      {
        method: 'POST',
        body: JSON.stringify(payload)
      }
    );
  },

  rejectAdminBankTransfer(intentId: string, payload?: { adminNote?: string }) {
    return request<import('../types/bank').BankTransferIntentRow>(
      `/api/admin/bank-transfers/${encodeURIComponent(intentId)}/reject`,
      {
        method: 'POST',
        body: JSON.stringify(payload ?? {})
      }
    );
  },

  adminEasypayProvision(payload: {
    externalUserId: string;
    ownerEmail: string;
    ownerName: string;
    businessName: string;
    slug?: string;
    industry?: string;
    webhookUrl?: string | null;
  }) {
    return request<{
      message: string;
      data: {
        businessId: string;
        userId: string;
        subscriptionId: string;
        slug: string;
        idempotentReplay: boolean;
      };
    }>('/api/admin/easypay/provision', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }
};
