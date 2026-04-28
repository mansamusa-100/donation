import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import {
  BanknoteIcon,
  ClipboardListIcon,
  ExternalLinkIcon,
  HistoryIcon,
  LayoutDashboardIcon,
  Menu,
  ShieldAlertIcon,
  UserCog,
  UsersIcon,
  X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { BRAND_LOGO_SRC, BRAND_NAME } from '../lib/brand';
import { api } from '../lib/api';
import { mediaUrl } from '../lib/mediaUrl';
import type {
  AdminAccountRow,
  AdminActivityItem,
  AdminCampaign,
  AdminCampaignStatus,
  AdminDashboardStats,
  AdminPanelKey,
  AdminUserRow,
  AdminWithdrawalRequestRow,
  AdminWithdrawalStatus
} from '../types/admin';

type AdminTab = AdminPanelKey;

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

const PANEL_KEY_LABEL: Record<AdminPanelKey, string> = {
  overview: 'Dashboard (overview + activity)',
  queue: 'Review queue',
  campaigns: 'All campaigns',
  withdrawals: 'Withdrawals',
  users: 'Users (activate/deactivate)',
  admins: 'Admins (create + permissions)'
};

const ALL_PANEL_KEYS = Object.keys(PANEL_KEY_LABEL) as AdminPanelKey[];

function canAccessPanel(
  role: 'ADMIN' | 'USER' | undefined,
  permissions: string[] | undefined,
  key: AdminPanelKey
) {
  if (role !== 'ADMIN') {
    return false;
  }
  if (permissions == null || permissions.length === 0) {
    return true;
  }
  return permissions.includes(key);
}

const NAV_DEF: { id: AdminTab; label: string; icon: typeof LayoutDashboardIcon }[] = [
  { id: 'overview', label: 'Dashboard', icon: LayoutDashboardIcon },
  { id: 'queue', label: 'Review queue', icon: ClipboardListIcon },
  { id: 'campaigns', label: 'All campaigns', icon: ShieldAlertIcon },
  { id: 'withdrawals', label: 'Withdrawals', icon: BanknoteIcon },
  { id: 'users', label: 'Users', icon: UsersIcon },
  { id: 'admins', label: 'Admins', icon: UserCog }
];

const ACTIVITY_PAGE_SIZE = 10;
const ADMIN_TABLE_PAGE_SIZE = 12;

function AdminPaginator({
  page,
  pageSize,
  total,
  onPageChange,
  className = ''
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (p: number) => void;
  className?: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div
      className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-slate-100 px-4 py-3 bg-slate-50/80 ${className}`}>
      <p className="text-xs text-slate-500">
        {total === 0 ? (
          'No entries'
        ) : (
          <>
            Showing <span className="font-semibold text-slate-700">{from}</span>–
            <span className="font-semibold text-slate-700">{to}</span> of{' '}
            <span className="font-semibold text-slate-700">{total}</span>
          </>
        )}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={page <= 1 || total === 0}
          onClick={() => onPageChange(page - 1)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">
          Previous
        </button>
        <span className="text-xs font-semibold text-slate-600 tabular-nums px-1">
          Page {page} / {totalPages}
        </span>
        <button
          type="button"
          disabled={page >= totalPages || total === 0}
          onClick={() => onPageChange(page + 1)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">
          Next
        </button>
      </div>
    </div>
  );
}

type NavItem = (typeof NAV_DEF)[number];

function AdminNavItems({
  items,
  activeTab,
  onSelect
}: {
  items: NavItem[];
  activeTab: AdminTab;
  onSelect: (id: AdminTab) => void;
}) {
  return (
    <nav
      className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2 min-h-0"
      role="navigation"
      aria-label="Admin sections">
      {items.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onSelect(id)}
          className={`flex w-full min-h-[2.75rem] items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
            activeTab === id
              ? 'bg-brand-600 text-white shadow-md'
              : 'text-slate-300 hover:bg-slate-800 hover:text-white'
          }`}>
          <Icon className="h-4 w-4 shrink-0" />
          {label}
        </button>
      ))}
    </nav>
  );
}

export function AdminPage() {
  const { user, isLoading: authLoading, refreshUser } = useAuth();
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
  const [adminAccounts, setAdminAccounts] = useState<AdminAccountRow[]>([]);
  const [accountActionError, setAccountActionError] = useState('');
  const [busyAccountId, setBusyAccountId] = useState<string | null>(null);
  const [newAdmin, setNewAdmin] = useState({ email: '', password: '', fullName: '', phoneNumber: '' });
  const [newAdminFull, setNewAdminFull] = useState(true);
  const [newAdminKeys, setNewAdminKeys] = useState<AdminPanelKey[]>(['overview']);
  const [editing, setEditing] = useState<Record<string, { full: boolean; keys: AdminPanelKey[] }>>({});
  const [newAdminSubmitting, setNewAdminSubmitting] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [activityPage, setActivityPage] = useState(1);
  const [activityTotal, setActivityTotal] = useState(0);
  const [queuePage, setQueuePage] = useState(1);
  const [queueTotal, setQueueTotal] = useState(0);
  const [campaignsPage, setCampaignsPage] = useState(1);
  const [campaignsTotal, setCampaignsTotal] = useState(0);
  const [withdrawalsPage, setWithdrawalsPage] = useState(1);
  const [withdrawalsTotal, setWithdrawalsTotal] = useState(0);
  const [usersPage, setUsersPage] = useState(1);
  const [usersTotal, setUsersTotal] = useState(0);

  const canAccess = useCallback(
    (key: AdminPanelKey) => canAccessPanel(user?.role, user?.adminPanelPermissions, key),
    [user?.adminPanelPermissions, user?.role]
  );

  const loadData = useCallback(async () => {
    if (user?.role !== 'ADMIN') {
      return;
    }
    setLoadError('');
    const p = user.adminPanelPermissions;
    const full = p == null || p.length === 0;
    const can = (key: AdminPanelKey) => full || p.includes(key);
    try {
      const fetches: Promise<unknown>[] = [];
      if (can('overview')) {
        fetches.push(
          (async () => {
            const [statsRes, activityRes] = await Promise.all([
              api.getAdminStats(),
              api.getAdminActivity({ page: activityPage, pageSize: ACTIVITY_PAGE_SIZE })
            ]);
            setStats(statsRes);
            setActivity(activityRes.items);
            setActivityTotal(activityRes.total);
          })()
        );
      } else {
        setStats(null);
        setActivity([]);
        setActivityTotal(0);
      }
      if (can('queue')) {
        fetches.push(
          api
            .getAdminPendingCampaigns({ page: queuePage, pageSize: ADMIN_TABLE_PAGE_SIZE })
            .then((r) => {
              setPending(r.items);
              setQueueTotal(r.total);
            })
        );
      } else {
        setPending([]);
        setQueueTotal(0);
      }
      if (can('campaigns')) {
        fetches.push(
          api
            .getAdminCampaigns({ page: campaignsPage, pageSize: ADMIN_TABLE_PAGE_SIZE })
            .then((r) => {
              setAllCampaigns(r.items);
              setCampaignsTotal(r.total);
            })
        );
      } else {
        setAllCampaigns([]);
        setCampaignsTotal(0);
      }
      if (can('users')) {
        fetches.push(
          api.getAdminUsers({ page: usersPage, pageSize: ADMIN_TABLE_PAGE_SIZE }).then((r) => {
            setUsers(r.items);
            setUsersTotal(r.total);
          })
        );
      } else {
        setUsers([]);
        setUsersTotal(0);
      }
      if (can('withdrawals')) {
        fetches.push(
          api
            .getAdminWithdrawalRequests({ page: withdrawalsPage, pageSize: ADMIN_TABLE_PAGE_SIZE })
            .then((r) => {
              setWithdrawals(r.items);
              setWithdrawalsTotal(r.total);
            })
        );
      } else {
        setWithdrawals([]);
        setWithdrawalsTotal(0);
      }
      if (can('admins')) {
        fetches.push(
          api.getAdminAccounts().then((r) => {
            setAdminAccounts(r);
          })
        );
      } else {
        setAdminAccounts([]);
      }
      await Promise.all(fetches);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load admin data');
    }
  }, [
    user,
    activityPage,
    queuePage,
    campaignsPage,
    withdrawalsPage,
    usersPage
  ]);

  const navItems = useMemo(
    () => NAV_DEF.filter((n) => canAccess(n.id)),
    [canAccess]
  );

  const allowedTabIds = useMemo(() => new Set(navItems.map((n) => n.id)), [navItems]);
  
  useEffect(() => {
    if (user?.role === 'ADMIN') {
      void loadData();
    }
  }, [loadData, user?.adminPanelPermissions, user?.role]);

  useEffect(() => {
    if (navItems.length > 0 && !allowedTabIds.has(tab)) {
      setTab(navItems[0].id);
    }
  }, [allowedTabIds, navItems, tab]);

  useEffect(() => {
    if (mobileNavOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    if (!mobileNavOpen) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileNavOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileNavOpen]);

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

  const getEditState = (row: AdminAccountRow) => {
    return (
      editing[row.id] ?? {
        full: row.accessScope === 'full',
        keys: (row.adminPanelPermissions.length ? row.adminPanelPermissions : ['overview']) as AdminPanelKey[]
      }
    );
  };

  const handleSaveAccountPermissions = async (row: AdminAccountRow) => {
    setAccountActionError('');
    const st = getEditState(row);
    if (!st.full && st.keys.length === 0) {
      setAccountActionError('Choose at least one area, or set full access.');
      return;
    }
    const body = st.full ? [] : [...st.keys];
    setBusyAccountId(row.id);
    try {
      await api.updateAdminAccountPermissions(row.id, body);
      setEditing((e) => {
        const next = { ...e };
        delete next[row.id];
        return next;
      });
      await loadData();
      if (row.id === user.id) {
        await refreshUser();
      }
    } catch (err) {
      setAccountActionError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusyAccountId(null);
    }
  };

  const handleCreateAdmin = async (e: FormEvent) => {
    e.preventDefault();
    setAccountActionError('');
    if (!newAdminFull && newAdminKeys.length === 0) {
      setAccountActionError('Choose at least one area, or use full access.');
      return;
    }
    setNewAdminSubmitting(true);
    try {
      await api.createAdminAccount({
        email: newAdmin.email.trim(),
        password: newAdmin.password,
        fullName: newAdmin.fullName.trim(),
        phoneNumber: newAdmin.phoneNumber.trim() || undefined,
        adminPanelPermissions: newAdminFull ? [] : [...newAdminKeys]
      });
      setNewAdmin({ email: '', password: '', fullName: '', phoneNumber: '' });
      setNewAdminFull(true);
      setNewAdminKeys(['overview']);
      await loadData();
    } catch (err) {
      setAccountActionError(err instanceof Error ? err.message : 'Could not create admin');
    } finally {
      setNewAdminSubmitting(false);
    }
  };

  const toggleKey = (key: AdminPanelKey, list: AdminPanelKey[], onChange: (k: AdminPanelKey[]) => void) => {
    onChange(
      list.includes(key) ? list.filter((k) => k !== key) : [...list, key]
    );
  };

  const selectTab = (id: AdminTab) => {
    setTab(id);
    setMobileNavOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col md:flex-row text-slate-900">
      <header
        className="md:hidden sticky top-0 z-30 flex shrink-0 items-center justify-between gap-2 border-b border-slate-800/90 bg-slate-950 px-2 py-2.5 pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] pt-[max(0.5rem,env(safe-area-inset-top))] text-slate-200 shadow-sm">
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-slate-200 hover:bg-slate-800 active:bg-slate-700"
          aria-controls="admin-nav-drawer"
          aria-haspopup="dialog"
          aria-label="Open admin menu">
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex min-w-0 flex-1 flex-col items-center gap-1 pr-1 text-center">
          <img src={BRAND_LOGO_SRC} alt="" className="h-7 w-7 object-contain" width={28} height={28} loading="lazy" />
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">{BRAND_NAME}</p>
          <p className="truncate text-sm font-bold text-white font-display">Admin</p>
        </div>
        <Link
          to="/"
          className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white"
          title="View public site"
          aria-label="View public site">
          <ExternalLinkIcon className="h-5 w-5" />
        </Link>
      </header>

      <div
        className={
          'fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm transition-opacity duration-200 ease-out md:hidden' +
          (mobileNavOpen ? ' pointer-events-auto opacity-100' : ' pointer-events-none opacity-0')
        }
        onClick={() => setMobileNavOpen(false)}
        aria-hidden="true"
        role="presentation"
      />

      <aside
        id="admin-nav-drawer"
        className={
          'fixed top-0 left-0 z-50 flex h-full max-h-[100dvh] w-[min(20rem,100vw-1rem)] max-w-[20rem] flex-col overflow-hidden border-r border-slate-800 bg-slate-950 text-slate-200 shadow-2xl transition-transform duration-200 ease-out overscroll-contain md:hidden' +
          (mobileNavOpen
            ? ' translate-x-0 pl-[max(0rem,env(safe-area-inset-left))] pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]'
            : ' -translate-x-full pointer-events-none')
        }
        role="dialog"
        aria-modal="true"
        aria-label="Admin menu">
        <div className="flex items-start justify-between gap-2 border-b border-slate-800 px-3 pb-3">
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <img
              src={BRAND_LOGO_SRC}
              alt=""
              className="mt-0.5 h-9 w-9 shrink-0 object-contain"
              width={36}
              height={36}
              loading="lazy"
            />
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{BRAND_NAME}</p>
              <p className="font-display text-lg font-bold text-white">Admin</p>
              <p className="mt-0.5 truncate text-xs text-slate-500" title={user.email}>
                {user.fullName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800"
            aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-1 pt-1">
          <AdminNavItems items={navItems} activeTab={tab} onSelect={selectTab} />
        </div>
        <div className="shrink-0 border-t border-slate-800 p-3">
          <Link
            to="/"
            onClick={() => setMobileNavOpen(false)}
            className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-700/80 bg-slate-900/50 py-2.5 text-sm font-semibold text-slate-200 hover:border-slate-600 hover:bg-slate-800">
            <ExternalLinkIcon className="h-4 w-4" />
            View public site
          </Link>
        </div>
      </aside>

      <aside
        className="hidden w-56 shrink-0 min-h-0 min-h-screen flex-col border-r border-slate-800 bg-slate-950 text-slate-200 md:flex"
        aria-label="Admin sidebar">
        <div className="border-b border-slate-800 p-4">
          <div className="flex items-center gap-2.5">
            <img
              src={BRAND_LOGO_SRC}
              alt=""
              className="h-9 w-9 shrink-0 object-contain"
              width={36}
              height={36}
              loading="lazy"
            />
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{BRAND_NAME}</p>
              <p className="font-display text-lg font-bold text-white">Admin</p>
              <p className="mt-0.5 truncate text-xs text-slate-500" title={user.email}>
                {user.fullName}
              </p>
            </div>
          </div>
        </div>
        <div className="min-h-0 flex flex-1 flex-col overflow-hidden">
          <AdminNavItems items={navItems} activeTab={tab} onSelect={setTab} />
        </div>
        <div className="mt-auto border-t border-slate-800 p-3">
          <Link
            to="/"
            className="flex items-center gap-2 rounded-lg px-2 py-2.5 text-xs font-semibold text-slate-400 transition-colors hover:bg-slate-800 hover:text-white">
            <ExternalLinkIcon className="h-3.5 w-3.5" />
            View public site
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:p-8">
        <div className="mx-auto w-full max-w-6xl">
          <header className="mb-5 md:mb-6">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-display font-bold text-slate-900 leading-tight">
              {navItems.find((n) => n.id === tab)?.label}
            </h1>
            <p className="text-slate-600 text-sm mt-1.5 max-w-3xl">
              {tab === 'overview' &&
                'Monitor submissions, approvals, and platform health. Organizers create campaigns; you review them here.'}
              {tab === 'queue' && 'Approve or reject campaigns before they appear on the public site.'}
              {tab === 'campaigns' && 'Full directory with statuses and moderation actions.'}
              {tab === 'withdrawals' &&
                'Review organizer payout requests. Approve before sending funds; mark Paid when completed.'}
              {tab === 'users' && 'Activate or deactivate organizer and admin accounts.'}
              {tab === 'admins' && 'Create additional admins and choose which areas of the panel they may use. Empty permission list = full access.'}
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

          {accountActionError && tab === 'admins' && (
            <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm font-medium">
              {accountActionError}
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
                <div className="divide-y divide-slate-100">
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
                <AdminPaginator
                  page={activityPage}
                  pageSize={ACTIVITY_PAGE_SIZE}
                  total={activityTotal}
                  onPageChange={setActivityPage}
                />
              </div>
            </div>
          )}

          {tab === 'queue' && (
            <div className="space-y-4">
              <p className="text-slate-600 text-sm">
                {queueTotal === 0
                  ? 'No campaigns are waiting for review.'
                  : `${queueTotal} campaign${queueTotal !== 1 ? 's' : ''} in the review queue.`}
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
              <AdminPaginator
                page={queuePage}
                pageSize={ADMIN_TABLE_PAGE_SIZE}
                total={queueTotal}
                onPageChange={setQueuePage}
              />
            </div>
          )}

          {tab === 'campaigns' && (
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
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
              <AdminPaginator
                page={campaignsPage}
                pageSize={ADMIN_TABLE_PAGE_SIZE}
                total={campaignsTotal}
                onPageChange={setCampaignsPage}
              />
            </div>
          )}

          {tab === 'withdrawals' && (
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
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
            <AdminPaginator
              page={withdrawalsPage}
              pageSize={ADMIN_TABLE_PAGE_SIZE}
              total={withdrawalsTotal}
              onPageChange={setWithdrawalsPage}
            />
            </div>
          )}

          {tab === 'users' && (
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
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
            <AdminPaginator
              page={usersPage}
              pageSize={ADMIN_TABLE_PAGE_SIZE}
              total={usersTotal}
              onPageChange={setUsersPage}
            />
            </div>
          )}

          {tab === 'admins' && canAccess('admins') && (
            <div className="space-y-8">
              <form
                onSubmit={handleCreateAdmin}
                className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4 max-w-2xl">
                <h2 className="font-display font-bold text-slate-900">Create admin</h2>
                <p className="text-sm text-slate-600">
                  New account role is <span className="font-semibold">Admin</span>. You can limit access to
                  specific areas, or choose full access (all areas, including this screen if they have the
                  &quot;Admins&quot; area).
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="text-xs font-bold text-slate-500 uppercase" htmlFor="admin-fullName">
                      Full name
                    </label>
                    <input
                      id="admin-fullName"
                      className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                      value={newAdmin.fullName}
                      onChange={(e) => setNewAdmin((a) => ({ ...a, fullName: e.target.value }))}
                      required
                      minLength={2}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase" htmlFor="admin-email">
                      Email
                    </label>
                    <input
                      id="admin-email"
                      type="email"
                      className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                      value={newAdmin.email}
                      onChange={(e) => setNewAdmin((a) => ({ ...a, email: e.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase" htmlFor="admin-password">
                      Password
                    </label>
                    <input
                      id="admin-password"
                      type="password"
                      className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                      value={newAdmin.password}
                      onChange={(e) => setNewAdmin((a) => ({ ...a, password: e.target.value }))}
                      required
                      minLength={6}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-bold text-slate-500 uppercase" htmlFor="admin-phone">
                      Phone (optional)
                    </label>
                    <input
                      id="admin-phone"
                      className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                      value={newAdmin.phoneNumber}
                      onChange={(e) => setNewAdmin((a) => ({ ...a, phoneNumber: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                    <input
                      type="checkbox"
                      checked={newAdminFull}
                      onChange={(e) => {
                        setNewAdminFull(e.target.checked);
                        if (e.target.checked) {
                          setNewAdminKeys(['overview']);
                        }
                      }}
                    />
                    Full access (all areas)
                  </label>
                  {!newAdminFull && (
                    <div className="pl-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {ALL_PANEL_KEYS.map((k) => (
                        <label key={k} className="flex items-start gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={newAdminKeys.includes(k)}
                            onChange={() => toggleKey(k, newAdminKeys, setNewAdminKeys)}
                          />
                          <span>{PANEL_KEY_LABEL[k]}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={newAdminSubmitting}
                  className="px-4 py-2.5 rounded-lg bg-brand-600 text-white text-sm font-bold hover:bg-brand-700 disabled:opacity-50">
                  {newAdminSubmitting ? 'Creating…' : 'Create admin'}
                </button>
              </form>

              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
                <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/80">
                  <h2 className="font-display font-bold text-slate-900">All admins</h2>
                  <p className="text-xs text-slate-500">Adjust permissions; changes take effect on next request.</p>
                </div>
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-500 font-semibold bg-slate-50">
                      <th className="px-4 py-3">Admin</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 min-w-[280px]">Access</th>
                      <th className="px-4 py-3 text-right">Save</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminAccounts.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-slate-500 text-center">
                          No admin rows returned.
                        </td>
                      </tr>
                    ) : (
                      adminAccounts.map((row) => {
                        const st = getEditState(row);
                        return (
                          <tr key={row.id} className="border-b border-slate-100 last:border-0 align-top">
                            <td className="px-4 py-3">
                              <div className="font-bold text-slate-900">{row.fullName}</div>
                              <div className="text-xs text-slate-500">{row.email}</div>
                              {row.id === user.id && (
                                <span className="mt-1 inline-block text-[10px] font-bold uppercase tracking-wide text-brand-700">
                                  You
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                                  row.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                                }`}>
                                {row.isActive ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-800">
                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={st.full}
                                  onChange={(e) => {
                                    const nextFull = e.target.checked;
                                    setEditing((m) => ({
                                      ...m,
                                      [row.id]: {
                                        full: nextFull,
                                        keys: nextFull
                                          ? (row.adminPanelPermissions.length
                                              ? (row.adminPanelPermissions as AdminPanelKey[])
                                              : ['overview'])
                                          : row.adminPanelPermissions.length
                                            ? (row.adminPanelPermissions as AdminPanelKey[])
                                            : ['overview', 'queue']
                                      }
                                    }));
                                  }}
                                />
                                Full access
                              </label>
                              {!st.full && (
                                <div className="mt-2 grid grid-cols-1 gap-1.5">
                                  {ALL_PANEL_KEYS.map((k) => (
                                    <label key={k} className="flex items-start gap-2 text-xs text-slate-700">
                                      <input
                                        type="checkbox"
                                        className="mt-0.5"
                                        checked={st.keys.includes(k)}
                                        onChange={() =>
                                          setEditing((m) => {
                                            const base = m[row.id] ?? {
                                              full: st.full,
                                              keys: [...st.keys]
                                            };
                                            const keys = base.keys.includes(k)
                                              ? base.keys.filter((x) => x !== k)
                                              : [...base.keys, k];
                                            return { ...m, [row.id]: { full: false, keys } };
                                          })
                                        }
                                      />
                                      <span>{PANEL_KEY_LABEL[k]}</span>
                                    </label>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                type="button"
                                disabled={busyAccountId === row.id}
                                onClick={() => void handleSaveAccountPermissions(row)}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-900 text-white disabled:opacity-50">
                                {busyAccountId === row.id ? '…' : 'Save'}
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
