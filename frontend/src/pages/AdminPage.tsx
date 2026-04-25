import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import {
  BanknoteIcon,
  ClipboardListIcon,
  ExternalLinkIcon,
  HistoryIcon,
  LayoutDashboardIcon,
  ShieldAlertIcon,
  UsersIcon
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { mediaUrl } from '../lib/mediaUrl';
import type {
  AdminActivityItem,
  AdminCampaign,
  AdminCampaignStatus,
  AdminDashboardStats,
  AdminUserRow,
  AdminWithdrawalRequestRow,
  AdminWithdrawalStatus
} from '../types/admin';

type AdminTab = 'overview' | 'queue' | 'campaigns' | 'withdrawals' | 'users';

function formatGmd(amount: number) {
  return `D${amount.toLocaleString()}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function statusBadgeClass(status: AdminCampaignStatus) {
  switch (status) {
    case 'Active':
      return 'bg-emerald-100 text-emerald-800';
    case 'PendingReview':
      return 'bg-amber-100 text-amber-800';
    case 'Rejected':
      return 'bg-red-100 text-red-800';
    case 'Closed':
      return 'bg-slate-200 text-slate-700';
    default:
      return 'bg-slate-100 text-slate-600';
  }
}

function activityTypeLabel(type: string) {
  switch (type) {
    case 'CAMPAIGN_SUBMITTED':
      return 'Submission';
    case 'CAMPAIGN_STATUS_CHANGED':
      return 'Campaign';
    case 'USER_STATUS_CHANGED':
      return 'Account';
    case 'WITHDRAWAL_REQUESTED':
      return 'Withdrawal';
    case 'WITHDRAWAL_STATUS_CHANGED':
      return 'Withdrawal';
    default:
      return type;
  }
}

function withdrawalStatusBadgeClass(status: AdminWithdrawalStatus) {
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
      return 'bg-slate-100 text-slate-700';
  }
}

export function AdminPage() {
  const { user, isLoading: authLoading } = useAuth();
  const location = useLocation();
  const [tab, setTab] = useState<AdminTab>('overview');
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [activity, setActivity] = useState<AdminActivityItem[]>([]);
  const [pending, setPending] = useState<AdminCampaign[]>([]);
  const [allCampaigns, setAllCampaigns] = useState<AdminCampaign[]>([]);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loadError, setLoadError] = useState('');
  const [busyCampaignId, setBusyCampaignId] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [busyWithdrawalId, setBusyWithdrawalId] = useState<string | null>(null);
  const [withdrawals, setWithdrawals] = useState<AdminWithdrawalRequestRow[]>([]);
  const [actionError, setActionError] = useState('');

  const loadData = useCallback(async () => {
    setLoadError('');
    try {
      const [statsRes, activityRes, pendingRes, allRes, usersRes, withdrawalsRes] = await Promise.all([
        api.getAdminStats(),
        api.getAdminActivity(),
        api.getAdminPendingCampaigns(),
        api.getAdminCampaigns(),
        api.getAdminUsers(),
        api.getAdminWithdrawalRequests()
      ]);
      setStats(statsRes);
      setActivity(activityRes);
      setPending(pendingRes);
      setAllCampaigns(allRes);
      setUsers(usersRes);
      setWithdrawals(withdrawalsRes);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load admin data');
    }
  }, []);

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      void loadData();
    }
  }, [user?.role, loadData]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-sm font-medium">
        Loading admin…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (user.role !== 'ADMIN') {
    return <Navigate to="/" replace />;
  }

  const handleOpenVerificationDocument = async (campaignId: string) => {
    setActionError('');
    try {
      const blob = await api.getAdminVerificationDocumentBlob(campaignId);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not open document');
    }
  };

  const handleCampaignStatus = async (
    campaignId: string,
    status: 'Active' | 'Rejected' | 'Closed'
  ) => {
    if (status === 'Rejected' && !window.confirm('Reject this campaign? It will be hidden from the public site.')) {
      return;
    }
    if (status === 'Closed' && !window.confirm('Close this campaign?')) {
      return;
    }
    setActionError('');
    setBusyCampaignId(campaignId);
    try {
      await api.updateAdminCampaignStatus(campaignId, status);
      await loadData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusyCampaignId(null);
    }
  };

  const handleWithdrawalStatus = async (
    requestId: string,
    status: 'Approved' | 'Rejected' | 'Paid'
  ) => {
    if (status === 'Rejected' && !window.confirm('Reject this withdrawal request?')) {
      return;
    }
    setActionError('');
    setBusyWithdrawalId(requestId);
    try {
      await api.updateAdminWithdrawalRequest(requestId, { status });
      await loadData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusyWithdrawalId(null);
    }
  };

  const handleUserToggle = async (row: AdminUserRow) => {
    if (row.id === user.id && row.isActive) {
      setActionError('You cannot deactivate your own account.');
      return;
    }
    setActionError('');
    setBusyUserId(row.id);
    try {
      await api.updateAdminUserStatus(row.id, !row.isActive);
      await loadData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusyUserId(null);
    }
  };

  const navItems: { id: AdminTab; label: string; icon: typeof LayoutDashboardIcon }[] = [
    { id: 'overview', label: 'Dashboard', icon: LayoutDashboardIcon },
    { id: 'queue', label: 'Review queue', icon: ClipboardListIcon },
    { id: 'campaigns', label: 'All campaigns', icon: ShieldAlertIcon },
    { id: 'withdrawals', label: 'Withdrawals', icon: BanknoteIcon },
    { id: 'users', label: 'Users', icon: UsersIcon }
  ];

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col md:flex-row text-slate-900">
      <aside className="bg-slate-950 text-slate-200 border-b md:border-b-0 md:border-r border-slate-800 shrink-0 md:w-56 md:min-h-screen flex flex-col">
        <div className="p-4 border-b border-slate-800">
          <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">GambiaFund</p>
          <p className="text-lg font-display font-bold text-white">Admin</p>
          <p className="text-xs text-slate-500 mt-1 truncate" title={user.email}>
            {user.fullName}
          </p>
        </div>
        <nav className="flex md:flex-col gap-1 p-2 overflow-x-auto md:overflow-visible">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${
                tab === id
                  ? 'bg-brand-600 text-white shadow-md'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}>
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </button>
          ))}
        </nav>
        <div className="hidden md:block mt-auto p-3 border-t border-slate-800">
          <Link
            to="/"
            className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors px-2 py-2 rounded-lg hover:bg-slate-800">
            <ExternalLinkIcon className="w-3.5 h-3.5" />
            View public site
          </Link>
        </div>
      </aside>

      <div className="flex-1 min-w-0 p-4 md:p-8 overflow-auto">
        <div className="max-w-6xl mx-auto">
          <div className="flex md:hidden mb-4">
            <Link
              to="/"
              className="text-xs font-semibold text-brand-700 flex items-center gap-1 hover:text-brand-900">
              <ExternalLinkIcon className="w-3.5 h-3.5" />
              Public site
            </Link>
          </div>

          <header className="mb-6">
            <h1 className="text-2xl md:text-3xl font-display font-bold text-slate-900">
              {navItems.find((n) => n.id === tab)?.label}
            </h1>
            <p className="text-slate-600 text-sm mt-1">
              {tab === 'overview' &&
                'Monitor submissions, approvals, and platform health. Organizers create campaigns; you review them here.'}
              {tab === 'queue' && 'Approve or reject campaigns before they appear on the public site.'}
              {tab === 'campaigns' && 'Full directory with statuses and moderation actions.'}
              {tab === 'withdrawals' &&
                'Review organizer payout requests. Approve before sending funds; mark Paid when completed.'}
              {tab === 'users' && 'Activate or deactivate organizer and admin accounts.'}
            </p>
          </header>

          {loadError && (
            <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm font-medium">
              {loadError}
            </div>
          )}

          {actionError && (
            <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm font-medium">
              {actionError}
            </div>
          )}

          {tab === 'overview' && stats && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Campaigns</p>
                  <p className="text-3xl font-display font-bold text-slate-900 mt-1">{stats.campaigns.total}</p>
                  <p className="text-xs text-slate-500 mt-2">
                    {stats.campaigns.active} active · {stats.campaigns.pending} pending
                  </p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Users</p>
                  <p className="text-3xl font-display font-bold text-slate-900 mt-1">{stats.users.total}</p>
                  <p className="text-xs text-slate-500 mt-2">{stats.users.admins} administrators</p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Donations</p>
                  <p className="text-3xl font-display font-bold text-slate-900 mt-1">
                    {stats.donations.toLocaleString()}
                  </p>
                  <p className="text-xs text-slate-500 mt-2">Recorded donation rows</p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Platform raised</p>
                  <p className="text-3xl font-display font-bold text-brand-600 mt-1">
                    {stats.platformStats ? formatGmd(stats.platformStats.totalRaised) : '—'}
                  </p>
                  <p className="text-xs text-slate-500 mt-2">Aggregate through campaigns</p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Voluntary support (tips)</p>
                  <p className="text-3xl font-display font-bold text-emerald-700 mt-1">
                    {stats.platformStats ? formatGmd(stats.platformStats.totalPlatformTips ?? 0) : '—'}
                  </p>
                  <p className="text-xs text-slate-500 mt-2">Optional tips at checkout</p>
                </div>
              </div>

              {stats.fees && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                      Donation platform fees (1.9%)
                    </p>
                    <p className="text-2xl font-display font-bold text-slate-900 mt-1">
                      {formatGmd(stats.fees.totalDonationPlatformFees)}
                    </p>
                    <p className="text-xs text-slate-500 mt-2">Sum recorded on all donations</p>
                  </div>
                  <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                      Withdrawal fees (3%, paid out)
                    </p>
                    <p className="text-2xl font-display font-bold text-slate-900 mt-1">
                      {formatGmd(stats.fees.totalWithdrawalProcessingFees)}
                    </p>
                    <p className="text-xs text-slate-500 mt-2">Sum on withdrawals marked Paid</p>
                  </div>
                </div>
              )}

              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2 bg-slate-50/80">
                  <HistoryIcon className="w-5 h-5 text-slate-600" />
                  <div>
                    <h2 className="font-display font-bold text-slate-900">Recent activity</h2>
                    <p className="text-xs text-slate-500">
                      Logged events and email alerts (when SMTP is configured) for admins and organizers.
                    </p>
                  </div>
                </div>
                <div className="max-h-[420px] overflow-y-auto divide-y divide-slate-100">
                  {activity.length === 0 ? (
                    <p className="p-6 text-sm text-slate-500">No activity yet. New campaign submissions will appear here.</p>
                  ) : (
                    activity.map((row) => (
                      <div key={row.id} className="px-5 py-3 hover:bg-slate-50/80">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                            {activityTypeLabel(row.type)}
                          </span>
                          <span className="text-xs text-slate-400">{formatDateTime(row.createdAt)}</span>
                        </div>
                        <p className="text-sm font-semibold text-slate-900">{row.title}</p>
                        {row.detail && <p className="text-xs text-slate-600 mt-1 whitespace-pre-wrap">{row.detail}</p>}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === 'queue' && (
            <div className="space-y-4">
              <p className="text-slate-600 text-sm">
                {pending.length === 0
                  ? 'No campaigns are waiting for review.'
                  : `${pending.length} campaign${pending.length === 1 ? '' : 's'} need your decision.`}
              </p>
              <div className="space-y-4">
                {pending.map((c) => (
                  <article
                    key={c.id}
                    className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col md:flex-row">
                    <img
                      src={mediaUrl(c.coverImage)}
                      alt=""
                      className="w-full md:w-52 h-40 md:h-auto object-cover shrink-0"
                    />
                    <div className="p-5 flex-1 flex flex-col">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${statusBadgeClass(c.status)}`}>
                          {c.status}
                        </span>
                        <span className="text-xs font-semibold text-slate-500">{c.category}</span>
                      </div>
                      <h2 className="text-lg font-display font-bold text-slate-900">{c.title}</h2>
                      <p className="text-sm text-slate-600 mt-2 line-clamp-2">{c.shortDescription}</p>
                      <div className="mt-3 text-sm text-slate-500">
                        <span className="font-semibold text-slate-700">Creator:</span> {c.creatorName}
                        {c.creator && (
                          <span className="block mt-1">
                            Account: {c.creator.fullName} · {c.creator.email}
                            {c.creator.phoneNumber ? ` · ${c.creator.phoneNumber}` : ''}
                          </span>
                        )}
                      </div>
                      <div className="mt-2 text-sm">
                        <span className="font-semibold text-slate-700">Goal:</span> {formatGmd(c.goalAmount)} ·
                        submitted {formatDate(c.createdAt)}
                      </div>
                      <div className="mt-auto pt-5 flex flex-wrap gap-2">
                        {c.verificationDocumentUrl ? (
                          <button
                            type="button"
                            onClick={() => void handleOpenVerificationDocument(c.id)}
                            className="px-4 py-2 rounded-lg border border-slate-200 text-slate-800 font-bold text-sm hover:bg-slate-50 flex items-center gap-1.5">
                            <ExternalLinkIcon className="w-4 h-4" />
                            View ID document
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={busyCampaignId === c.id}
                          onClick={() => void handleCampaignStatus(c.id, 'Active')}
                          className="px-4 py-2 rounded-lg bg-brand-600 text-white font-bold text-sm hover:bg-brand-700 disabled:opacity-50">
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={busyCampaignId === c.id}
                          onClick={() => void handleCampaignStatus(c.id, 'Rejected')}
                          className="px-4 py-2 rounded-lg border-2 border-red-200 text-red-700 font-bold text-sm hover:bg-red-50 disabled:opacity-50">
                          Reject
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}

          {tab === 'campaigns' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500 font-semibold bg-slate-50">
                    <th className="px-4 py-3">Campaign</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Goal</th>
                    <th className="px-4 py-3">Creator</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {allCampaigns.map((c) => (
                    <tr key={c.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-900">{c.title}</div>
                        <div className="text-xs text-slate-500">{formatDate(c.createdAt)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${statusBadgeClass(c.status)}`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium">{formatGmd(c.goalAmount)}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {c.creator?.fullName ?? c.creatorName}
                        {c.creator && <div className="text-xs text-slate-500">{c.creator.email}</div>}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="flex flex-wrap justify-end gap-2">
                          {c.status === 'Active' && (
                            <Link
                              to={`/campaign/${c.slug}`}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold text-brand-600 hover:bg-brand-50">
                              View
                            </Link>
                          )}
                          {c.status === 'PendingReview' && (
                            <>
                              <button
                                type="button"
                                disabled={busyCampaignId === c.id}
                                onClick={() => void handleCampaignStatus(c.id, 'Active')}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-brand-600 text-white disabled:opacity-50">
                                Approve
                              </button>
                              <button
                                type="button"
                                disabled={busyCampaignId === c.id}
                                onClick={() => void handleCampaignStatus(c.id, 'Rejected')}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold text-red-700 border border-red-200 disabled:opacity-50">
                                Reject
                              </button>
                            </>
                          )}
                          {c.status === 'Active' && (
                            <button
                              type="button"
                              disabled={busyCampaignId === c.id}
                              onClick={() => void handleCampaignStatus(c.id, 'Closed')}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-700 border border-slate-200 disabled:opacity-50">
                              Close
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'withdrawals' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
              {withdrawals.length === 0 ? (
                <p className="p-8 text-sm text-slate-500">No withdrawal requests yet.</p>
              ) : (
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-500 font-semibold bg-slate-50">
                      <th className="px-4 py-3">Campaign</th>
                      <th className="px-4 py-3">Organizer</th>
                      <th className="px-4 py-3">Requested</th>
                      <th className="px-4 py-3">Fee (3%)</th>
                      <th className="px-4 py-3">Net</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {withdrawals.map((w) => (
                      <tr key={w.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-4 py-3">
                          <div className="font-bold text-slate-900">{w.campaign.title}</div>
                          <div className="text-xs text-slate-500">
                            Raised {formatGmd(w.campaign.raisedAmount)} · {w.campaign.status}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          <div className="font-medium">{w.user.fullName}</div>
                          <div className="text-xs text-slate-500">{w.user.email}</div>
                        </td>
                        <td className="px-4 py-3 font-bold text-slate-900">{formatGmd(w.amount)}</td>
                        <td className="px-4 py-3 text-slate-700">{formatGmd(w.processingFeeAmount)}</td>
                        <td className="px-4 py-3 font-semibold text-emerald-800">{formatGmd(w.netAmount)}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`text-xs font-bold px-2 py-0.5 rounded-md ${withdrawalStatusBadgeClass(w.status)}`}>
                            {w.status}
                          </span>
                          {w.note && (
                            <div className="text-xs text-slate-500 mt-1 max-w-[200px]">&quot;{w.note}&quot;</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                          {formatDateTime(w.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex flex-wrap justify-end gap-2">
                            {w.status === 'Pending' && (
                              <>
                                <button
                                  type="button"
                                  disabled={busyWithdrawalId === w.id}
                                  onClick={() => void handleWithdrawalStatus(w.id, 'Approved')}
                                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-brand-600 text-white disabled:opacity-50">
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  disabled={busyWithdrawalId === w.id}
                                  onClick={() => void handleWithdrawalStatus(w.id, 'Rejected')}
                                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-red-700 border border-red-200 disabled:opacity-50">
                                  Reject
                                </button>
                              </>
                            )}
                            {w.status === 'Approved' && (
                              <button
                                type="button"
                                disabled={busyWithdrawalId === w.id}
                                onClick={() => void handleWithdrawalStatus(w.id, 'Paid')}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-700 text-white disabled:opacity-50">
                                Mark paid
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === 'users' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500 font-semibold bg-slate-50">
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Campaigns / donations</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-900">{u.fullName}</div>
                        <div className="text-xs text-slate-500">{u.email}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                            u.role === 'ADMIN' ? 'bg-brand-100 text-brand-800' : 'bg-slate-100 text-slate-700'
                          }`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {u._count.campaigns} / {u._count.donations}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                            u.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                          }`}>
                          {u.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          disabled={busyUserId === u.id || (u.id === user.id && u.isActive)}
                          onClick={() => void handleUserToggle(u)}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 hover:bg-slate-50 disabled:opacity-40">
                          {u.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
