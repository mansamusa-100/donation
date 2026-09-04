import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  WalletIcon,
  TrendingUpIcon,
  UsersIcon,
  PlusIcon,
  ArrowRightIcon,
  HeartIcon,
  BanknoteIcon,
  Building2,
  CheckCircle2Icon,
  PartyPopperIcon,
  XIcon
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { toUserFriendlyError } from '../lib/userFriendlyError';
import { mediaUrl } from '../lib/mediaUrl';
import { DataLoadAlert } from '../components/DataLoadAlert';
import { PayoutMethodsPanel } from '../components/PayoutMethodsPanel';
import { ProfileAvatarEditor } from '../components/ProfileAvatarEditor';
import { CloseAccountPanel } from '../components/CloseAccountPanel';
import type { UserPayoutMethod } from '../types/payout';
import type { BankTransferStatus } from '../types/bank';
import type {
  Campaign,
  CampaignStatus,
  CreatorDashboardOverview,
  CreatorWithdrawalRequest,
  WithdrawalRequestStatus
} from '../types/campaign';

function bankTransferStatusClass(status: BankTransferStatus) {
  switch (status) {
    case 'Pending':
      return 'bg-amber-100 text-amber-900';
    case 'Confirmed':
      return 'bg-emerald-100 text-emerald-900';
    case 'Rejected':
      return 'bg-red-100 text-red-900';
    case 'Expired':
      return 'bg-surface-100 text-surface-700';
    default:
      return 'bg-surface-100 text-surface-700';
  }
}

function withdrawalStatusClass(status: WithdrawalRequestStatus) {
  switch (status) {
    case 'Pending':
      return 'bg-amber-100 text-amber-900';
    case 'Approved':
      return 'bg-blue-100 text-blue-900';
    case 'Paid':
      return 'bg-emerald-100 text-emerald-900';
    case 'Rejected':
      return 'bg-red-100 text-red-900';
    default:
      return 'bg-surface-100 text-surface-700';
  }
}

function statusBadgeClass(status: CampaignStatus | undefined) {
  switch (status) {
    case 'Active':
      return 'bg-emerald-100 text-emerald-800';
    case 'PendingReview':
      return 'bg-amber-100 text-amber-800';
    case 'Rejected':
      return 'bg-red-100 text-red-800';
    case 'Closed':
      return 'bg-surface-200 text-surface-700';
    case 'Ended':
      return 'bg-surface-300 text-surface-800';
    default:
      return 'bg-surface-100 text-surface-600';
  }
}

type CampaignSubmissionCelebration = {
  title: string;
  slug: string;
};

export function DashboardPage() {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [data, setData] = useState<CreatorDashboardOverview | null>(null);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [withdrawalBusySlug, setWithdrawalBusySlug] = useState<string | null>(null);
  const [lifecycleBusySlug, setLifecycleBusySlug] = useState<string | null>(null);
  const [lifecycleFormError, setLifecycleFormError] = useState('');
  const [withdrawalFormError, setWithdrawalFormError] = useState('');
  const [payoutMethods, setPayoutMethods] = useState<UserPayoutMethod[]>([]);
  const [celebration, setCelebration] = useState<CampaignSubmissionCelebration | null>(null);

  useEffect(() => {
    const state = location.state as
      | {
          campaignSubmitted?: boolean;
          submittedTitle?: string;
          submittedSlug?: string;
        }
      | undefined;
    if (!state?.campaignSubmitted || !state.submittedTitle) {
      return;
    }
    setCelebration({
      title: state.submittedTitle,
      slug: state.submittedSlug ?? ''
    });
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state, location.pathname, navigate]);

  const load = useCallback(async () => {
    setLoadState('loading');
    setErrorMessage('');
    try {
      const [overview, methods] = await Promise.all([
        api.getCreatorDashboard(),
        api.getPayoutMethods().catch(() => [] as UserPayoutMethod[])
      ]);
      setData(overview);
      setPayoutMethods(methods);
      setLoadState('ready');
    } catch (err) {
      console.error('Dashboard load failed:', err);
      setErrorMessage(
        toUserFriendlyError(err, 'We could not load your dashboard. Please check your connection and try again.')
      );
      setLoadState('error');
      setData(null);
    }
  }, []);

  const refreshPayoutMethods = useCallback(async () => {
    try {
      setPayoutMethods(await api.getPayoutMethods());
    } catch (err) {
      console.error('Payout methods refresh failed:', err);
    }
  }, []);

  const handleConfirmEnd = async (slug: string) => {
    if (
      !window.confirm(
        'Confirm end of campaign? Donations will stop once all raised funds have been paid out via withdrawals.'
      )
    ) {
      return;
    }
    setLifecycleFormError('');
    setLifecycleBusySlug(slug);
    try {
      await api.confirmCampaignEnd(slug);
      await load();
    } catch (err) {
      setLifecycleFormError(err instanceof Error ? err.message : 'Could not confirm end');
    } finally {
      setLifecycleBusySlug(null);
    }
  };

  const handleRequestExtension = async (
    slug: string,
    campaignEndDate: string,
    reason: string
  ) => {
    setLifecycleFormError('');
    setLifecycleBusySlug(slug);
    try {
      await api.requestCampaignExtension(slug, {
        campaignEndDate,
        reason: reason || undefined
      });
      await load();
    } catch (err) {
      setLifecycleFormError(err instanceof Error ? err.message : 'Extension request failed');
    } finally {
      setLifecycleBusySlug(null);
    }
  };

  const submitWithdrawal = async (
    slug: string,
    amount: number,
    payoutMethodId: string,
    note: string
  ) => {
    setWithdrawalFormError('');
    setWithdrawalBusySlug(slug);
    try {
      await api.createWithdrawalRequest({
        campaignSlug: slug,
        amount,
        payoutMethodId,
        note: note || undefined
      });
      await load();
    } catch (err) {
      setWithdrawalFormError(err instanceof Error ? err.message : 'Withdrawal request failed');
    } finally {
      setWithdrawalBusySlug(null);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      void load();
    }
  }, [isAuthenticated, load]);

  if (authLoading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center text-surface-500 font-medium">Loading…</div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const campaigns = data?.campaigns ?? [];
  const withdrawals = data?.withdrawalRequests ?? [];
  const recent = data?.recentDonations ?? [];
  const made = data?.donationsMade ?? [];
  const bankTransfers = data?.bankTransfers ?? [];
  const totals = {
    totalRaised: 0,
    totalDonors: 0,
    totalGiven: 0,
    ...data?.totals
  };

  return (
    <div className="min-h-screen bg-surface-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-surface-900">Dashboard</h1>
            <p className="text-surface-500">
              Welcome back, {user.fullName}. Manage campaigns, track donations, and request withdrawals.
            </p>
          </div>
          {user.role !== 'ADMIN' && (
            <Link
              to="/create"
              className="bg-brand-600 hover:bg-brand-700 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-colors shadow-sm">
              <PlusIcon className="w-5 h-5" /> New campaign
            </Link>
          )}
        </div>

        {user.role !== 'ADMIN' && (
          <div className="mb-8 bg-white p-5 rounded-2xl shadow-sm border border-surface-200">
            <ProfileAvatarEditor />
          </div>
        )}

        {loadState === 'error' && (
          <div className="mb-6">
            <DataLoadAlert message={errorMessage} onRetry={() => void load()} />
          </div>
        )}

        {celebration && (
          <div className="mb-6 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5 sm:p-6 shadow-sm relative overflow-hidden">
            <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-emerald-200/40 pointer-events-none" />
            <button
              type="button"
              onClick={() => setCelebration(null)}
              className="absolute top-3 right-3 p-2 rounded-lg text-surface-500 hover:bg-white/80 hover:text-surface-800"
              aria-label="Dismiss">
              <XIcon className="w-5 h-5" />
            </button>
            <div className="flex flex-col sm:flex-row sm:items-start gap-4 pr-10">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-md">
                <PartyPopperIcon className="w-6 h-6" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <CheckCircle2Icon className="w-5 h-5 text-emerald-600 shrink-0" />
                  <h2 className="text-lg font-display font-bold text-surface-900">Campaign submitted successfully</h2>
                </div>
                <p className="text-surface-700 font-medium">&ldquo;{celebration.title}&rdquo; is in the review queue.</p>
                <p className="text-sm text-surface-600 mt-2 max-w-2xl">
                  Our team will verify your details. You&rsquo;ll get an email when the campaign goes live on the public
                  site. Until then, track status and manage your work from this dashboard — your campaign shows as{' '}
                  <span className="font-semibold text-amber-800">Pending review</span>.
                </p>
              </div>
            </div>
          </div>
        )}

        {loadState === 'loading' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-36 rounded-2xl bg-surface-200/60 animate-pulse border border-surface-200" />
            ))}
          </div>
        )}

        {loadState === 'ready' && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-surface-200">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-3 bg-brand-50 text-brand-600 rounded-xl">
                    <TrendingUpIcon className="w-6 h-6" />
                  </div>
                  <span className="text-xs font-bold text-surface-500 bg-surface-100 px-2 py-1 rounded-lg">
                    Your campaigns
                  </span>
                </div>
                <div className="text-3xl font-display font-bold text-surface-900 mb-1">
                  D{totals.totalRaised.toLocaleString()}
                </div>
                <p className="text-sm text-surface-500">Total raised across campaigns you created</p>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-sm border border-surface-200">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-3 bg-blue-50 text-gambia-blue rounded-xl">
                    <WalletIcon className="w-6 h-6" />
                  </div>
                </div>
                <div className="text-3xl font-display font-bold text-surface-900 mb-1">{campaigns.length}</div>
                <p className="text-sm text-surface-500">Campaigns you have created</p>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-sm border border-surface-200">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
                    <UsersIcon className="w-6 h-6" />
                  </div>
                </div>
                <div className="text-3xl font-display font-bold text-surface-900 mb-1">
                  {totals.totalDonors.toLocaleString()}
                </div>
                <p className="text-sm text-surface-500">Donor count (sum across your campaigns)</p>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-sm border border-surface-200">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-3 bg-violet-50 text-violet-700 rounded-xl">
                    <HeartIcon className="w-6 h-6" />
                  </div>
                  <span className="text-xs font-bold text-surface-500 bg-surface-100 px-2 py-1 rounded-lg">
                    Signed-in gifts
                  </span>
                </div>
                <div className="text-3xl font-display font-bold text-surface-900 mb-1">
                  D{totals.totalGiven.toLocaleString()}
                </div>
                <p className="text-sm text-surface-500">Total you donated when logged in (non-anonymous)</p>
              </div>
            </div>

            <div className="mb-8">
              <PayoutMethodsPanel onUpdated={() => void refreshPayoutMethods()} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-6">
                {(withdrawalFormError || lifecycleFormError) && (
                  <div className="p-4 rounded-xl bg-red-50 border border-red-100 text-red-800 text-sm font-medium">
                    {withdrawalFormError || lifecycleFormError}
                  </div>
                )}

                <div className="bg-white rounded-2xl border border-surface-200 shadow-sm p-6">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="p-2.5 bg-brand-50 text-brand-600 rounded-xl">
                      <BanknoteIcon className="w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="text-lg font-display font-bold text-surface-900">Withdrawals</h2>
                      <p className="text-sm text-surface-500 mt-1">
                        Request a payout for funds raised on your campaigns. Pending, approved, and completed
                        requests reduce your available balance. Platform processing fees apply as described in
                        your campaign terms.
                      </p>
                    </div>
                  </div>

                  {withdrawals.length === 0 ? (
                    <p className="text-sm text-surface-500">No withdrawal requests yet.</p>
                  ) : (
                    <ul className="divide-y divide-surface-100 border border-surface-100 rounded-xl overflow-hidden">
                      {withdrawals.map((w: CreatorWithdrawalRequest) => (
                        <li key={w.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2 bg-surface-50/50">
                          <div>
                            <p className="font-semibold text-surface-900 text-sm">
                              D{w.amount.toLocaleString()} requested · est. D{w.netAmount.toLocaleString()} to you
                              <span className="text-surface-500 font-normal">
                                {' '}
                                (3% fee D{w.processingFeeAmount.toLocaleString()}) · {w.campaignTitle}
                              </span>
                            </p>
                            <p className="text-xs text-surface-500">
                              {new Date(w.createdAt).toLocaleString()} ·{' '}
                              <Link
                                to={`/campaign/${w.campaignSlug}`}
                                className="text-brand-600 hover:underline font-medium">
                                View campaign
                              </Link>
                            </p>
                            {w.payoutSummary && (
                              <p className="text-xs text-surface-600 mt-1">Payout: {w.payoutSummary}</p>
                            )}
                            {w.payoutReference && (
                              <p className="text-xs text-emerald-800 mt-0.5">
                                Paid — ref: {w.payoutReference}
                              </p>
                            )}
                            {w.note && (
                              <p className="text-xs text-surface-600 mt-1 italic">&quot;{w.note}&quot;</p>
                            )}
                          </div>
                          <span
                            className={`text-xs font-bold px-2.5 py-1 rounded-md ${withdrawalStatusClass(w.status)}`}>
                            {w.status}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-display font-bold text-surface-900">My campaigns</h2>
                </div>

                {campaigns.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-surface-200 p-10 text-center">
                    <p className="text-surface-600 mb-4">You have not created any campaigns yet, or none are linked to your account.</p>
                    {user.role !== 'ADMIN' && (
                      <Link
                        to="/create"
                        className="inline-flex items-center gap-2 text-brand-600 font-bold hover:text-brand-700">
                        Create your first campaign <ArrowRightIcon className="w-4 h-4" />
                      </Link>
                    )}
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl shadow-sm border border-surface-200 overflow-hidden divide-y divide-surface-100">
                    {campaigns.map((c: Campaign) => (
                      <CampaignRow
                        key={c.id}
                        campaign={c}
                        payoutMethods={payoutMethods}
                        kycStatus={user.kycStatus}
                        busy={withdrawalBusySlug === c.slug || lifecycleBusySlug === c.slug}
                        onWithdraw={submitWithdrawal}
                        onConfirmEnd={handleConfirmEnd}
                        onRequestExtension={handleRequestExtension}
                        onContactSaved={(updated) => {
                          setData((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  campaigns: prev.campaigns.map((row) =>
                                    row.id === updated.id ? { ...row, ...updated } : row
                                  )
                                }
                              : prev
                          );
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-6">
                <h2 className="text-xl font-display font-bold text-surface-900">Recent donations to you</h2>
                <div className="bg-white rounded-2xl shadow-sm border border-surface-200 p-6">
                  {recent.length === 0 ? (
                    <p className="text-sm text-surface-500">No donations yet to campaigns you created.</p>
                  ) : (
                    <div className="space-y-4">
                      {recent.map((d) => (
                        <div
                          key={d.id}
                          className="flex justify-between items-start pb-4 border-b border-surface-100 last:border-0 last:pb-0">
                          <div>
                            <div className="font-bold text-surface-900 text-sm">{d.name}</div>
                            <div className="text-xs text-surface-500 mt-0.5">
                              {d.timeAgo} ·{' '}
                              <Link to={`/campaign/${d.campaignSlug}`} className="text-brand-600 hover:underline">
                                {d.campaignTitle}
                              </Link>
                              {d.reversedAt ? (
                                <span className="ml-1.5 inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-rose-100 text-rose-800">
                                  Reversed
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <div className={`font-bold shrink-0 ${d.reversedAt ? 'text-slate-400 line-through' : 'text-brand-600'}`}>
                            {d.currency === 'USD' ? '$' : 'D'}
                            {d.amount.toLocaleString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <h2 className="text-xl font-display font-bold text-surface-900">Your bank transfers</h2>
                <p className="text-xs text-surface-500 -mt-4">
                  Track bank donations you started. Status updates when our team confirms your payment.
                </p>
                <div className="bg-white rounded-2xl shadow-sm border border-surface-200 p-6">
                  {bankTransfers.length === 0 ? (
                    <p className="text-sm text-surface-500">
                      No bank transfers yet.{' '}
                      <Link to="/track-bank-transfer" className="font-semibold text-brand-700 hover:underline">
                        Track a transfer by reference
                      </Link>
                    </p>
                  ) : (
                    <ul className="divide-y divide-surface-100 border border-surface-100 rounded-xl overflow-hidden">
                      {bankTransfers.map((t) => (
                        <li
                          key={t.id}
                          className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 bg-surface-50/50">
                          <div className="min-w-0 flex items-start gap-3">
                            <div className="p-2 bg-brand-50 text-brand-700 rounded-lg shrink-0">
                              <Building2 className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-surface-900 text-sm">
                                D{(t.confirmedAmount ?? t.declaredAmount).toLocaleString()}
                                {t.campaignTitle ? (
                                  <span className="text-surface-500 font-normal"> · {t.campaignTitle}</span>
                                ) : null}
                              </p>
                              <p className="text-xs text-surface-500 mt-0.5">
                                <span className="font-mono font-semibold text-surface-700">{t.clientReference}</span>
                                {' · '}
                                {new Date(t.createdAt).toLocaleString()}
                              </p>
                              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-xs">
                                <Link
                                  to={`/track-bank-transfer?ref=${encodeURIComponent(t.clientReference)}`}
                                  className="font-semibold text-brand-700 hover:underline">
                                  Track status
                                </Link>
                                {t.status === 'Pending' ? (
                                  <Link
                                    to={`/payment/bank/pending?ref=${encodeURIComponent(t.clientReference)}`}
                                    className="font-semibold text-surface-700 hover:underline">
                                    View instructions
                                  </Link>
                                ) : null}
                                {t.campaignSlug ? (
                                  <Link
                                    to={`/campaign/${t.campaignSlug}`}
                                    className="font-semibold text-surface-700 hover:underline">
                                    Campaign
                                  </Link>
                                ) : null}
                              </div>
                            </div>
                          </div>
                          <span
                            className={`text-xs font-bold px-2.5 py-1 rounded-md shrink-0 ${bankTransferStatusClass(t.status)}`}>
                            {t.status}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <h2 className="text-xl font-display font-bold text-surface-900">Your contributions</h2>
                <p className="text-xs text-surface-500 -mt-4">
                  Donations made while signed in without &quot;anonymous&quot; are linked to your account.
                </p>
                <div className="bg-white rounded-2xl shadow-sm border border-surface-200 p-6">
                  {made.length === 0 ? (
                    <p className="text-sm text-surface-500">
                      No linked donations yet. Give to a campaign while logged in (not anonymous) to see them here.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {made.map((d) => (
                        <div
                          key={d.id}
                          className="flex justify-between items-start pb-4 border-b border-surface-100 last:border-0 last:pb-0">
                          <div>
                            <Link
                              to={`/campaign/${d.campaignSlug}`}
                              className="font-bold text-surface-900 text-sm hover:text-brand-600">
                              {d.campaignTitle}
                            </Link>
                            <div className="text-xs text-surface-500 mt-0.5">
                              {d.timeAgo}
                              {d.reversedAt ? (
                                <span className="ml-1.5 inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-rose-100 text-rose-800">
                                  Reversed
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <div className={`font-bold shrink-0 ${d.reversedAt ? 'text-slate-400 line-through' : 'text-violet-700'}`}>
                            {d.currency === 'USD' ? '$' : 'D'}
                            {d.amount.toLocaleString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {user.role !== 'ADMIN' && (
              <div className="mt-10">
                <CloseAccountPanel />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function CampaignRow({
  campaign,
  payoutMethods,
  kycStatus,
  onWithdraw,
  onConfirmEnd,
  onRequestExtension,
  onContactSaved,
  busy
}: {
  campaign: Campaign;
  payoutMethods: UserPayoutMethod[];
  kycStatus?: 'Unverified' | 'Pending' | 'Verified' | 'Rejected';
  onWithdraw: (slug: string, amount: number, payoutMethodId: string, note: string) => Promise<void>;
  onConfirmEnd: (slug: string) => Promise<void>;
  onRequestExtension: (slug: string, endDate: string, reason: string) => Promise<void>;
  onContactSaved: (campaign: Campaign) => void;
  busy: boolean;
}) {
  const [wAmount, setWAmount] = useState('');
  const [wNote, setWNote] = useState('');
  const defaultMethodId =
    payoutMethods.find((m) => m.isDefault)?.id ?? payoutMethods[0]?.id ?? '';
  const [payoutMethodId, setPayoutMethodId] = useState(defaultMethodId);
  const [extDate, setExtDate] = useState('');
  const [extReason, setExtReason] = useState('');
  const [showExtensionForm, setShowExtensionForm] = useState(false);
  const [showContactForm, setShowContactForm] = useState(false);
  const [contactPhone, setContactPhone] = useState(campaign.contactPhone ?? '');
  const [contactWhatsApp, setContactWhatsApp] = useState(campaign.contactWhatsApp ?? '');
  const [showPublicContact, setShowPublicContact] = useState(Boolean(campaign.showPublicContact));
  const [contactBusy, setContactBusy] = useState(false);
  const [contactError, setContactError] = useState('');
  const [contactSaved, setContactSaved] = useState(false);
  const progress = Math.min(100, Math.round((campaign.raisedAmount / campaign.goalAmount) * 100));
  const status = campaign.status ?? 'Active';
  const available = campaign.availableForWithdrawal ?? 0;
  const donationPlatformFeeTotal = campaign.donationPlatformFeeTotal ?? 0;
  const netRaisedAmount = campaign.netRaisedAmount ?? Math.max(0, campaign.raisedAmount - donationPlatformFeeTotal);
  const canWithdraw = (status === 'Active' || status === 'Closed') && available > 0;
  const kycOk = kycStatus === 'Verified';
  const canRequestWithdraw = canWithdraw && kycOk;
  const fundraisingPeriodEnded = campaign.fundraisingPeriodEnded === true;
  const acceptingDonations = campaign.acceptingDonations !== false;
  const canConfirmEnd = campaign.canConfirmEnd === true;
  const pendingExtension = campaign.pendingExtension;
  const canEditContact = status !== 'Closed' && status !== 'Rejected';

  useEffect(() => {
    if (!payoutMethodId && defaultMethodId) {
      setPayoutMethodId(defaultMethodId);
    }
  }, [defaultMethodId, payoutMethodId]);

  useEffect(() => {
    setContactPhone(campaign.contactPhone ?? '');
    setContactWhatsApp(campaign.contactWhatsApp ?? '');
    setShowPublicContact(Boolean(campaign.showPublicContact));
  }, [campaign.contactPhone, campaign.contactWhatsApp, campaign.showPublicContact]);

  const handleWithdrawSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = Math.round(Number(wAmount) * 100) / 100;
    if (!Number.isFinite(n) || n < 1) {
      return;
    }
    if (!payoutMethodId) {
      return;
    }
    await onWithdraw(campaign.slug, n, payoutMethodId, wNote.trim());
    setWAmount('');
    setWNote('');
  };

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setContactError('');
    setContactSaved(false);
    if (showPublicContact && !contactPhone.trim() && !contactWhatsApp.trim()) {
      setContactError('Add a phone or WhatsApp number to show contact details publicly.');
      return;
    }
    setContactBusy(true);
    try {
      const updated = await api.updateCampaignContact(campaign.slug, {
        showPublicContact,
        contactPhone: contactPhone.trim() || null,
        contactWhatsApp: contactWhatsApp.trim() || null
      });
      onContactSaved(updated);
      setContactSaved(true);
    } catch (err) {
      setContactError(toUserFriendlyError(err, 'Could not update contact details.'));
    } finally {
      setContactBusy(false);
    }
  };

  return (
    <div className="p-6 flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row gap-4 items-center">
        <img
          src={mediaUrl(campaign.coverImage)}
          alt=""
          className="w-20 h-20 rounded-xl object-cover shrink-0"
        />
        <div className="flex-1 text-center sm:text-left w-full">
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-1">
            <h3 className="font-bold text-surface-900">{campaign.title}</h3>
            <span className={`px-2 py-0.5 text-xs font-bold rounded-md ${statusBadgeClass(status)}`}>{status}</span>
          </div>
          <div className="w-full bg-surface-200 rounded-full h-2 mb-1 mt-3">
            <div className="bg-brand-600 h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex justify-between text-xs font-medium">
            <span className="text-brand-600">D{campaign.raisedAmount.toLocaleString()} raised</span>
            <span className="text-surface-500">Goal: D{campaign.goalAmount.toLocaleString()}</span>
          </div>
          {available > 0 && (
            <p className="text-xs text-surface-600 mt-2">
              Available for withdrawal after donation platform fees:{' '}
              <span className="font-bold text-surface-900">D{available.toLocaleString()}</span>
            </p>
          )}
          {donationPlatformFeeTotal > 0 && (
            <p className="text-xs text-surface-500 mt-1">
              Gross raised D{campaign.raisedAmount.toLocaleString()} · Donation platform fees D
              {donationPlatformFeeTotal.toLocaleString()} · Net campaign funds D{netRaisedAmount.toLocaleString()}
            </p>
          )}
          {fundraisingPeriodEnded && acceptingDonations && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5 mt-2">
              Fundraising period ended. Donations still accepted until you confirm end of campaign.
            </p>
          )}
          {campaign.ownerConfirmedEndAt && !acceptingDonations && (
            <p className="text-xs text-surface-600 mt-2">
              You confirmed end of campaign — new donations are closed. The campaign stays visible
              {campaign.allFundsPaidOut ? '.' : ' while you withdraw remaining funds.'}
            </p>
          )}
          {pendingExtension && (
            <p className="text-xs text-blue-800 bg-blue-50 border border-blue-100 rounded-lg px-2 py-1.5 mt-2">
              Extension to {pendingExtension.requestedEndDate} pending admin approval.
            </p>
          )}
          {campaign.pendingContentRevision && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5 mt-2">
              Content edits pending admin approval — public page unchanged until approved.
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2 w-full sm:w-auto shrink-0">
          {status === 'Active' && (
            <Link
              to={`/campaign/${campaign.slug}`}
              className="px-4 py-2 border border-surface-200 rounded-lg text-sm font-semibold text-center hover:bg-surface-50">
              View public page
            </Link>
          )}
          {(status === 'Active' ||
            status === 'PendingReview' ||
            status === 'Rejected' ||
            status === 'Draft') &&
            !campaign.pendingContentRevision && (
              <Link
                to={`/campaign/${campaign.slug}/edit`}
                className="px-4 py-2 border border-brand-200 bg-brand-50 text-brand-800 rounded-lg text-sm font-semibold text-center hover:bg-brand-100">
                Edit campaign
              </Link>
            )}
          {(status === 'PendingReview' || status === 'Draft') && (
            <span className="px-4 py-2 rounded-lg text-xs font-semibold text-center text-amber-800 bg-amber-50 border border-amber-100">
              Public page opens after approval
            </span>
          )}
          {canEditContact && (
            <button
              type="button"
              onClick={() => {
                setShowContactForm((v) => !v);
                setContactError('');
                setContactSaved(false);
              }}
              className="px-4 py-2 border border-surface-200 rounded-lg text-sm font-semibold text-center hover:bg-surface-50"
            >
              {showContactForm ? 'Hide contact settings' : 'Inquiry contact'}
            </button>
          )}
        </div>
      </div>

      {showContactForm && canEditContact && (
        <form
          onSubmit={(e) => void handleContactSubmit(e)}
          className="pl-0 sm:pl-24 border-t border-surface-100 pt-4 space-y-3"
        >
          <p className="text-xs text-surface-500">
            Optional. When enabled, donors can call or WhatsApp you from the campaign page. Include country code
            (e.g. +220…).
          </p>
          <label className="flex items-start gap-2 text-sm text-surface-800 cursor-pointer">
            <input
              type="checkbox"
              checked={showPublicContact}
              onChange={(e) => setShowPublicContact(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-surface-300 text-brand-600 focus:ring-brand-500"
            />
            Show contact details on the public campaign page
          </label>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-surface-600 mb-1" htmlFor={`phone-${campaign.id}`}>
                Mobile (call)
              </label>
              <input
                id={`phone-${campaign.id}`}
                type="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="+220 4512233"
                className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-surface-600 mb-1" htmlFor={`wa-${campaign.id}`}>
                WhatsApp
              </label>
              <input
                id={`wa-${campaign.id}`}
                type="tel"
                value={contactWhatsApp}
                onChange={(e) => setContactWhatsApp(e.target.value)}
                placeholder="+220 6612610"
                className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm"
              />
            </div>
          </div>
          {contactError && <p className="text-xs text-red-600">{contactError}</p>}
          {contactSaved && <p className="text-xs text-emerald-700">Contact details saved.</p>}
          <button
            type="submit"
            disabled={contactBusy || busy}
            className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50"
          >
            {contactBusy ? 'Saving…' : 'Save contact details'}
          </button>
        </form>
      )}

      {status === 'Active' && (
        <div className="pl-0 sm:pl-24 border-t border-surface-100 pt-4 flex flex-wrap gap-2">
          {canConfirmEnd && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onConfirmEnd(campaign.slug)}
              className="px-3 py-2 rounded-lg border border-surface-300 text-sm font-semibold text-surface-800 hover:bg-surface-50 disabled:opacity-50">
              Confirm end of campaign
            </button>
          )}
          {!pendingExtension && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setShowExtensionForm((v) => !v)}
              className="px-3 py-2 rounded-lg border border-brand-200 text-sm font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50">
              {showExtensionForm ? 'Cancel extension' : 'Request period extension'}
            </button>
          )}
        </div>
      )}

      {showExtensionForm && status === 'Active' && !pendingExtension && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!extDate) {
              return;
            }
            void onRequestExtension(campaign.slug, extDate, extReason.trim()).then(() => {
              setShowExtensionForm(false);
              setExtDate('');
              setExtReason('');
            });
          }}
          className="pl-0 sm:pl-24 border-t border-surface-100 pt-4 space-y-3">
          <p className="text-xs font-semibold text-surface-700 uppercase tracking-wide">
            Request extension (admin must approve)
          </p>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <input
              id={`ext-date-${campaign.id}`}
              type="date"
              value={extDate}
              onChange={(e) => setExtDate(e.target.value)}
              aria-label="New end date"
              required
              disabled={busy}
              className="px-3 py-2 border border-surface-200 rounded-lg text-sm"
            />
            <input
              type="text"
              value={extReason}
              onChange={(e) => setExtReason(e.target.value)}
              placeholder="Reason (optional)"
              maxLength={500}
              disabled={busy}
              className="flex-1 px-3 py-2 border border-surface-200 rounded-lg text-sm"
            />
            <button
              type="submit"
              disabled={busy || !extDate}
              className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-bold disabled:opacity-50">
              Submit request
            </button>
          </div>
        </form>
      )}

      {canWithdraw && !kycOk && (
        <div className="pl-0 sm:pl-24 border-t border-surface-100 pt-4">
          <p className="text-sm text-amber-900 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            {kycStatus === 'Pending'
              ? 'Identity verification is under review. You can request a withdrawal once an admin verifies your ID.'
              : kycStatus === 'Rejected'
                ? 'Your ID was rejected. Upload a clearer document when creating a campaign (or contact support), then wait for re-approval before withdrawing.'
                : 'Identity verification is required before withdrawals. Upload a government ID with your campaign and wait for admin approval.'}
          </p>
        </div>
      )}

      {canRequestWithdraw && (
        <form
          onSubmit={(e) => void handleWithdrawSubmit(e)}
          className="pl-0 sm:pl-24 border-t border-surface-100 pt-4 space-y-3">
          <p className="text-xs font-semibold text-surface-700 uppercase tracking-wide">Request withdrawal</p>
          {payoutMethods.length === 0 ? (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              Add a payout method above before requesting a withdrawal.
            </p>
          ) : (
            <div>
              <label htmlFor={`wd-payout-${campaign.id}`} className="block text-xs font-medium text-surface-600 mb-1">
                Pay out via
              </label>
              <select
                id={`wd-payout-${campaign.id}`}
                value={payoutMethodId}
                onChange={(e) => setPayoutMethodId(e.target.value)}
                className="w-full max-w-md px-3 py-2 border border-surface-200 rounded-lg text-sm"
                disabled={busy}>
                {payoutMethods.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.type} — {m.summary}
                    {m.isDefault ? ' (default)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="flex-1 min-w-0">
              <label htmlFor={`wd-amount-${campaign.id}`} className="sr-only">
                Amount (GMD)
              </label>
              <input
                id={`wd-amount-${campaign.id}`}
                type="number"
                min={1}
                max={available}
                step="0.01"
                inputMode="decimal"
                value={wAmount}
                onChange={(e) => setWAmount(e.target.value)}
                placeholder={`Max D${available.toLocaleString()}`}
                className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm"
                disabled={busy}
              />
            </div>
            <div className="flex-[2] min-w-0">
              <label htmlFor={`wd-note-${campaign.id}`} className="sr-only">
                Note to admin (optional)
              </label>
              <input
                id={`wd-note-${campaign.id}`}
                type="text"
                value={wNote}
                onChange={(e) => setWNote(e.target.value)}
                placeholder="Note to admin (optional)"
                maxLength={500}
                className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm"
                disabled={busy}
              />
            </div>
            <button
              type="submit"
              disabled={busy || payoutMethods.length === 0 || !payoutMethodId}
              className="px-4 py-2 rounded-lg bg-surface-900 text-white text-sm font-bold hover:bg-surface-800 disabled:opacity-50">
              {busy ? 'Sending…' : 'Submit request'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
