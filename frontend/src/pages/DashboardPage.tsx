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
  CheckCircle2Icon,
  PartyPopperIcon,
  XIcon
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { mediaUrl } from '../lib/mediaUrl';
import { DataLoadAlert } from '../components/DataLoadAlert';
import type {
  Campaign,
  CampaignStatus,
  CreatorDashboardOverview,
  CreatorWithdrawalRequest,
  WithdrawalRequestStatus
} from '../types/campaign';

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
  const [withdrawalFormError, setWithdrawalFormError] = useState('');
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
      const overview = await api.getCreatorDashboard();
      setData(overview);
      setLoadState('ready');
    } catch (err) {
      console.error('Dashboard load failed:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load dashboard');
      setLoadState('error');
      setData(null);
    }
  }, []);

  const submitWithdrawal = async (slug: string, amount: number, note: string) => {
    setWithdrawalFormError('');
    setWithdrawalBusySlug(slug);
    try {
      await api.createWithdrawalRequest({ campaignSlug: slug, amount, note: note || undefined });
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

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-6">
                {withdrawalFormError && (
                  <div className="p-4 rounded-xl bg-red-50 border border-red-100 text-red-800 text-sm font-medium">
                    {withdrawalFormError}
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
                        busy={withdrawalBusySlug === c.slug}
                        onWithdraw={submitWithdrawal}
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
                            </div>
                          </div>
                          <div className="font-bold text-brand-600 shrink-0">
                            {d.currency === 'USD' ? '$' : 'D'}
                            {d.amount.toLocaleString()}
                          </div>
                        </div>
                      ))}
                    </div>
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
                            <div className="text-xs text-surface-500 mt-0.5">{d.timeAgo}</div>
                          </div>
                          <div className="font-bold text-violet-700 shrink-0">
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
          </>
        )}
      </div>
    </div>
  );
}

function CampaignRow({
  campaign,
  onWithdraw,
  busy
}: {
  campaign: Campaign;
  onWithdraw: (slug: string, amount: number, note: string) => Promise<void>;
  busy: boolean;
}) {
  const [wAmount, setWAmount] = useState('');
  const [wNote, setWNote] = useState('');
  const progress = Math.min(100, Math.round((campaign.raisedAmount / campaign.goalAmount) * 100));
  const status = campaign.status ?? 'Active';
  const available = campaign.availableForWithdrawal ?? 0;
  const canWithdraw = (status === 'Active' || status === 'Closed') && available > 0;

  const handleWithdrawSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = Math.round(Number(wAmount));
    if (!Number.isFinite(n) || n < 1) {
      return;
    }
    await onWithdraw(campaign.slug, n, wNote.trim());
    setWAmount('');
    setWNote('');
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
              Available for withdrawal:{' '}
              <span className="font-bold text-surface-900">D{available.toLocaleString()}</span>
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
          {(status === 'PendingReview' || status === 'Draft') && (
            <span className="px-4 py-2 rounded-lg text-xs font-semibold text-center text-amber-800 bg-amber-50 border border-amber-100">
              Public page opens after approval
            </span>
          )}
        </div>
      </div>

      {canWithdraw && (
        <form
          onSubmit={(e) => void handleWithdrawSubmit(e)}
          className="pl-0 sm:pl-24 border-t border-surface-100 pt-4 space-y-3">
          <p className="text-xs font-semibold text-surface-700 uppercase tracking-wide">Request withdrawal</p>
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
                step={1}
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
              disabled={busy}
              className="px-4 py-2 rounded-lg bg-surface-900 text-white text-sm font-bold hover:bg-surface-800 disabled:opacity-50">
              {busy ? 'Sending…' : 'Submit request'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
