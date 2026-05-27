import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import {
  BanknoteIcon,
  BellIcon,
  ClipboardListIcon,
  ExternalLinkIcon,
  HistoryIcon,
  LayoutDashboardIcon,
  Menu,
  ScrollTextIcon,
  ShieldAlertIcon,
  UserCog,
  UsersIcon,
  Wallet,
  Building2,
  X
} from 'lucide-react';
import { BankAdminPanel } from '../components/admin/BankAdminPanel';
import { useAuth } from '../context/AuthContext';
import { BRAND_LOGO_SRC, BRAND_NAME } from '../lib/brand';
import { api } from '../lib/api';
import { mediaUrl } from '../lib/mediaUrl';
import {
  AUDIT_EVENT_TYPES,
  type AdminAccountRow,
  type AdminActivityItem,
  type AdminAuditLogItem,
  type AdminCampaign,
  type AdminCampaignStatus,
  type AdminExtensionRequestRow,
  type AdminDashboardStats,
  type AdminNotificationSummary,
  type AdminPanelKey,
  type AdminUserRow,
  type AdminWithdrawalRequestRow,
  type AdminWithdrawalStatus
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
    case 'Ended':
      return 'bg-slate-300 text-slate-800';
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
    case 'ADMIN_ACCOUNT_CREATED':
      return 'Admin created';
    case 'ADMIN_PERMISSIONS_CHANGED':
      return 'Admin permissions';
    case 'EASYPAY_PROVISION':
      return 'DPay';
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
  admins: 'Admins (create + permissions)',
  easypay: 'DPay (provision tenant)',
  bank: 'Bank transfers (donations + accounts)',
  audit: 'Audit log (reporting)'
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
  { id: 'admins', label: 'Admins', icon: UserCog },
  { id: 'easypay', label: 'DPay', icon: Wallet },
  { id: 'bank', label: 'Bank transfers', icon: Building2 },
  { id: 'audit', label: 'Audit log', icon: ScrollTextIcon }
];

const ACTIVITY_PAGE_SIZE = 10;
const ADMIN_TABLE_PAGE_SIZE = 12;
const AUDIT_PAGE_SIZE = 25;

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
  const [extensionRequests, setExtensionRequests] = useState<AdminExtensionRequestRow[]>([]);
  const [extensionTotal, setExtensionTotal] = useState(0);
  const [busyExtensionId, setBusyExtensionId] = useState<string | null>(null);
  const [allCampaigns, setAllCampaigns] = useState<AdminCampaign[]>([]);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loadError, setLoadError] = useState('');
  const [busyCampaignId, setBusyCampaignId] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [busyWithdrawalId, setBusyWithdrawalId] = useState<string | null>(null);
  const [markPaidWithdrawal, setMarkPaidWithdrawal] = useState<AdminWithdrawalRequestRow | null>(null);
  const [markPaidReference, setMarkPaidReference] = useState('');
  const [markPaidAdminNote, setMarkPaidAdminNote] = useState('');
  const [withdrawals, setWithdrawals] = useState<AdminWithdrawalRequestRow[]>([]);
  const [actionError, setActionError] = useState('');
  const [adminAccounts, setAdminAccounts] = useState<AdminAccountRow[]>([]);
  const [accountActionError, setAccountActionError] = useState('');
  const [busyAccountId, setBusyAccountId] = useState<string | null>(null);
  const [newAdmin, setNewAdmin] = useState({ email: '', password: '', fullName: '', phoneNumber: '' });
  const [newAdminFull, setNewAdminFull] = useState(true);
  const [newAdminKeys, setNewAdminKeys] = useState<AdminPanelKey[]>(['overview']);
  const [editing, setEditing] = useState<Record<string, { full: boolean; keys: AdminPanelKey[] }>>({});
  const [easypayForm, setEasypayForm] = useState({
    externalUserId: 'barakahfund-platform',
    ownerEmail: '',
    ownerName: '',
    businessName: '',
    slug: '',
    industry: '',
    webhookUrl: ''
  });
  const [easypaySubmitting, setEasypaySubmitting] = useState(false);
  const [easypayError, setEasypayError] = useState('');
  const [easypaySuccess, setEasypaySuccess] = useState<{
    message: string;
    data: {
      businessId: string;
      userId: string;
      subscriptionId: string;
      slug: string;
      idempotentReplay: boolean;
    };
  } | null>(null);
  const [newAdminSubmitting, setNewAdminSubmitting] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [auditItems, setAuditItems] = useState<AdminAuditLogItem[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(1);
  const [auditType, setAuditType] = useState('');
  const [auditFrom, setAuditFrom] = useState('');
  const [auditTo, setAuditTo] = useState('');
  const [auditSearchInput, setAuditSearchInput] = useState('');
  const [auditQ, setAuditQ] = useState('');
  const [auditLoadError, setAuditLoadError] = useState('');
  const [auditExportBusy, setAuditExportBusy] = useState(false);
  const [auditExportError, setAuditExportError] = useState('');

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
  const [notificationSummary, setNotificationSummary] = useState<AdminNotificationSummary | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState('');

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
          (async () => {
            const [pendingRes, extRes] = await Promise.all([
              api.getAdminPendingCampaigns({ page: queuePage, pageSize: ADMIN_TABLE_PAGE_SIZE }),
              api.getAdminPendingExtensionRequests({ page: 1, pageSize: 20 })
            ]);
            setPending(pendingRes.items);
            setQueueTotal(pendingRes.total);
            setExtensionRequests(extRes.items);
            setExtensionTotal(extRes.total);
          })()
        );
      } else {
        setPending([]);
        setQueueTotal(0);
        setExtensionRequests([]);
        setExtensionTotal(0);
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

  const loadNotifications = useCallback(async () => {
    if (user?.role !== 'ADMIN') {
      setNotificationSummary(null);
      return;
    }
    setNotificationsLoading(true);
    setNotificationsError('');
    try {
      const summary = await api.getAdminNotificationSummary();
      setNotificationSummary(summary);
    } catch (err) {
      setNotificationsError(err instanceof Error ? err.message : 'Failed to load notifications');
    } finally {
      setNotificationsLoading(false);
    }
  }, [user?.role]);

  const loadAudit = useCallback(async () => {
    if (user?.role !== 'ADMIN') {
      return;
    }
    const p = user.adminPanelPermissions;
    const full = p == null || p.length === 0;
    if (!full && !p.includes('audit')) {
      return;
    }
    setAuditLoadError('');
    try {
      const r = await api.getAdminAudit({
        page: auditPage,
        pageSize: AUDIT_PAGE_SIZE,
        type: auditType || undefined,
        from: auditFrom || undefined,
        to: auditTo || undefined,
        q: auditQ || undefined
      });
      setAuditItems(r.items);
      setAuditTotal(r.total);
    } catch (err) {
      setAuditItems([]);
      setAuditTotal(0);
      setAuditLoadError(err instanceof Error ? err.message : 'Failed to load audit log');
    }
  }, [user, auditPage, auditType, auditFrom, auditTo, auditQ]);

  const navItems = useMemo(
    () => NAV_DEF.filter((n) => canAccess(n.id)),
    [canAccess]
  );

  const allowedTabIds = useMemo(() => new Set(navItems.map((n) => n.id)), [navItems]);

  const visibleNotificationItems = useMemo(
    () =>
      (notificationSummary?.items ?? []).filter(
        (item) => item.count > 0 && allowedTabIds.has(item.tab)
      ),
    [allowedTabIds, notificationSummary?.items]
  );

  const notificationCount = visibleNotificationItems.reduce((sum, item) => sum + item.count, 0);
  
  useEffect(() => {
    if (user?.role === 'ADMIN') {
      void loadData();
      void loadNotifications();
    }
  }, [loadData, loadNotifications, user?.adminPanelPermissions, user?.role]);

  useEffect(() => {
    if (user?.role !== 'ADMIN') {
      return;
    }
    const id = window.setInterval(() => {
      void loadNotifications();
    }, 45_000);
    return () => window.clearInterval(id);
  }, [loadNotifications, user?.role]);

  useEffect(() => {
    if (navItems.length > 0 && !allowedTabIds.has(tab)) {
      setTab(navItems[0].id);
    }
  }, [allowedTabIds, navItems, tab]);

  useEffect(() => {
    const id = window.setTimeout(() => setAuditQ(auditSearchInput.trim()), 400);
    return () => window.clearTimeout(id);
  }, [auditSearchInput]);

  useEffect(() => {
    setAuditPage(1);
  }, [auditType, auditFrom, auditTo, auditQ]);

  useEffect(() => {
    if (user?.role !== 'ADMIN' || tab !== 'audit') {
      return;
    }
    const p = user.adminPanelPermissions;
    const full = p == null || p.length === 0;
    if (!full && !p.includes('audit')) {
      return;
    }
    void loadAudit();
  }, [user?.role, user?.adminPanelPermissions, tab, loadAudit]);

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

  const handleExtensionReview = async (
    requestId: string,
    status: 'Approved' | 'Rejected'
  ) => {
    if (status === 'Rejected' && !window.confirm('Reject this extension request?')) {
      return;
    }
    setActionError('');
    setBusyExtensionId(requestId);
    try {
      await api.reviewAdminExtensionRequest(requestId, { status });
      await loadData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Extension review failed');
    } finally {
      setBusyExtensionId(null);
    }
  };

  const handleEndInactive = async (campaignId: string, title: string) => {
    if (
      !window.confirm(
        `Mark "${title}" as Ended? This is for campaigns with no donation in 60+ days.`
      )
    ) {
      return;
    }
    setActionError('');
    setBusyCampaignId(campaignId);
    try {
      await api.endInactiveCampaign(campaignId);
      await loadData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not end campaign');
    } finally {
      setBusyCampaignId(null);
    }
  };

  const handleCampaignStatus = async (
    campaignId: string,
    status: 'Active' | 'Rejected' | 'Closed' | 'Ended'
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
    status: 'Approved' | 'Rejected' | 'Paid',
    extras?: { payoutReference?: string; adminNote?: string }
  ) => {
    if (status === 'Rejected' && !window.confirm('Reject this withdrawal request?')) {
      return;
    }
    setActionError('');
    setBusyWithdrawalId(requestId);
    try {
      await api.updateAdminWithdrawalRequest(requestId, {
        status,
        ...(extras?.payoutReference ? { payoutReference: extras.payoutReference } : {}),
        ...(extras?.adminNote !== undefined ? { adminNote: extras.adminNote } : {})
      });
      setMarkPaidWithdrawal(null);
      setMarkPaidReference('');
      setMarkPaidAdminNote('');
      await loadData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusyWithdrawalId(null);
    }
  };

  const submitMarkPaid = () => {
    if (!markPaidWithdrawal) {
      return;
    }
    const ref = markPaidReference.trim();
    if (!ref) {
      setActionError('Enter a payout reference (transfer ID, receipt number, or cash handoff note).');
      return;
    }
    void handleWithdrawalStatus(markPaidWithdrawal.id, 'Paid', {
      payoutReference: ref,
      adminNote: markPaidAdminNote.trim() || undefined
    });
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

  const submitEasypayProvision = async (e: FormEvent) => {
    e.preventDefault();
    setEasypayError('');
    setEasypaySuccess(null);
    setEasypaySubmitting(true);
    try {
      const res = await api.adminEasypayProvision({
        externalUserId: easypayForm.externalUserId.trim(),
        ownerEmail: easypayForm.ownerEmail.trim(),
        ownerName: easypayForm.ownerName.trim(),
        businessName: easypayForm.businessName.trim(),
        ...(easypayForm.slug.trim() ? { slug: easypayForm.slug.trim() } : {}),
        ...(easypayForm.industry.trim() ? { industry: easypayForm.industry.trim() } : {}),
        ...(easypayForm.webhookUrl.trim() ? { webhookUrl: easypayForm.webhookUrl.trim() } : {})
      });
      setEasypaySuccess(res);
    } catch (err) {
      setEasypayError(err instanceof Error ? err.message : 'Provision failed');
    } finally {
      setEasypaySubmitting(false);
    }
  };

  const handleExportAuditCsv = async () => {
    setAuditExportError('');
    setAuditExportBusy(true);
    try {
      const blob = await api.exportAdminAuditCsv({
        type: auditType || undefined,
        from: auditFrom || undefined,
        to: auditTo || undefined,
        q: auditQ || undefined
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'admin-audit-log.csv';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setAuditExportError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setAuditExportBusy(false);
    }
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
            <div className="flex items-start justify-between gap-4">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-display font-bold text-slate-900 leading-tight">
                {navItems.find((n) => n.id === tab)?.label}
              </h1>
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setNotificationsOpen((v) => !v)}
                  className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50"
                  aria-label={
                    notificationCount > 0
                      ? `${notificationCount} admin notifications`
                      : 'Admin notifications'
                  }>
                  <BellIcon className="h-5 w-5" />
                  {notificationCount > 0 && (
                    <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-600 px-1.5 py-0.5 text-center text-[10px] font-bold leading-none text-white">
                      {notificationCount > 99 ? '99+' : notificationCount}
                    </span>
                  )}
                </button>
                {notificationsOpen && (
                  <div className="absolute right-0 z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                    <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                      <div>
                        <p className="text-sm font-bold text-slate-900">Admin notifications</p>
                        <p className="text-xs text-slate-500">
                          {notificationCount > 0
                            ? `${notificationCount} item${notificationCount === 1 ? '' : 's'} need attention`
                            : 'No actionable items'}
                        </p>
                      </div>
                      {notificationsLoading && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          Updating
                        </span>
                      )}
                    </div>
                    {notificationsError ? (
                      <p className="px-4 py-3 text-sm text-red-700">{notificationsError}</p>
                    ) : visibleNotificationItems.length === 0 ? (
                      <p className="px-4 py-4 text-sm text-slate-500">
                        You are all caught up for the admin areas you can access.
                      </p>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {visibleNotificationItems.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              setTab(item.tab);
                              setNotificationsOpen(false);
                            }}
                            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50">
                            <span>
                              <span className="block text-sm font-semibold text-slate-900">{item.label}</span>
                              <span className="text-xs text-slate-500">Open {item.tab}</span>
                            </span>
                            <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-bold text-brand-800">
                              {item.count}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <p className="text-slate-600 text-sm mt-1.5 max-w-3xl">
              {tab === 'overview' &&
                'Monitor submissions, approvals, and platform health. Organizers create campaigns; you review them here.'}
              {tab === 'queue' && 'Approve or reject campaigns before they appear on the public site.'}
              {tab === 'campaigns' && 'Full directory with statuses and moderation actions.'}
              {tab === 'withdrawals' &&
                'Review organizer payout requests. Approve before sending funds; mark Paid when completed.'}
              {tab === 'users' && 'Activate or deactivate organizer and admin accounts.'}
              {tab === 'admins' && 'Create additional admins and choose which areas of the panel they may use. Empty permission list = full access.'}
              {tab === 'easypay' &&
                'Provision a merchant tenant on DPay (or replay safely with the same external user id). Copy businessId into server EASYPAY_PARTNER_BUSINESS_ID.'}
              {tab === 'bank' &&
                'Configure platform receiving accounts and confirm or reject inbound bank transfer donations. Enter the amount actually received when confirming.'}
              {tab === 'audit' &&
                'Filter and export the activity ledger: campaign reviews, withdrawals, user activation, and admin account changes.'}
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
            <div className="space-y-8">
              {extensionTotal > 0 && (
                <div className="space-y-3">
                  <h2 className="text-lg font-display font-bold text-slate-900">
                    Period extension requests ({extensionTotal})
                  </h2>
                  <div className="space-y-3">
                    {extensionRequests.map((r) => (
                      <article
                        key={r.id}
                        className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                        <h3 className="font-bold text-slate-900">{r.campaignTitle}</h3>
                        <p className="text-sm text-slate-600 mt-1">
                          {r.requestedBy.fullName} ({r.requestedBy.email}) · current end{' '}
                          {formatDate(r.currentEndsAt)} → requested {r.requestedEndDate}
                        </p>
                        {r.reason && (
                          <p className="text-sm text-slate-500 mt-2 italic">&ldquo;{r.reason}&rdquo;</p>
                        )}
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={busyExtensionId === r.id}
                            onClick={() => void handleExtensionReview(r.id, 'Approved')}
                            className="px-4 py-2 rounded-lg bg-brand-600 text-white font-bold text-sm disabled:opacity-50">
                            Approve
                          </button>
                          <button
                            type="button"
                            disabled={busyExtensionId === r.id}
                            onClick={() => void handleExtensionReview(r.id, 'Rejected')}
                            className="px-4 py-2 rounded-lg border-2 border-red-200 text-red-700 font-bold text-sm disabled:opacity-50">
                            Reject
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              )}

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
                          {c.status === 'Active' && c.inactive60Days && (
                            <button
                              type="button"
                              disabled={busyCampaignId === c.id}
                              onClick={() => void handleEndInactive(c.id, c.title)}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold text-amber-900 border border-amber-200 bg-amber-50 disabled:opacity-50"
                              title={
                                c.lastDonationAt
                                  ? `Last donation ${formatDate(c.lastDonationAt)}`
                                  : 'No donations yet'
                              }>
                              End (60d inactive)
                            </button>
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
                      <th className="px-4 py-3">Payout</th>
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
                        <td className="px-4 py-3 text-slate-700 max-w-[220px]">
                          {w.payoutDetailsFull ? (
                            <>
                              <div className="text-xs font-bold text-slate-500">{w.payoutMethodType}</div>
                              <div className="text-xs mt-0.5 break-words">{w.payoutDetailsFull}</div>
                            </>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                          {w.payoutReference && (
                            <div className="text-xs text-emerald-800 mt-1 font-medium">
                              Ref: {w.payoutReference}
                            </div>
                          )}
                        </td>
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
                                onClick={() => {
                                  setMarkPaidWithdrawal(w);
                                  setMarkPaidReference('');
                                  setMarkPaidAdminNote('');
                                  setActionError('');
                                }}
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

          {tab === 'bank' && canAccess('bank') && <BankAdminPanel />}

          {tab === 'easypay' && canAccess('easypay') && (
            <div className="max-w-2xl space-y-6">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
                <h2 className="font-display font-bold text-lg text-slate-900">DPay business provision</h2>
                <p className="text-sm text-slate-600">
                  Calls DPay <code className="text-xs bg-slate-100 px-1 rounded">POST /provision</code> with your
                  partner credentials. Use a stable <strong>External user id</strong> so repeats do not create duplicate
                  tenants. After success, set <code className="text-xs bg-slate-100 px-1">EASYPAY_PARTNER_BUSINESS_ID</code>{' '}
                  on the API server to the returned <strong>businessId</strong>.
                </p>
                {easypayError && (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">{easypayError}</div>
                )}
                {easypaySuccess && (
                  <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm space-y-2">
                    <p className="font-semibold">{easypaySuccess.message}</p>
                    <dl className="grid grid-cols-1 gap-1 text-xs font-mono">
                      <div>
                        <dt className="text-emerald-700 inline">businessId: </dt>
                        <dd className="inline break-all">{easypaySuccess.data.businessId}</dd>
                      </div>
                      <div>
                        <dt className="text-emerald-700 inline">slug: </dt>
                        <dd className="inline">{easypaySuccess.data.slug}</dd>
                      </div>
                      <div>
                        <dt className="text-emerald-700 inline">idempotentReplay: </dt>
                        <dd className="inline">{String(easypaySuccess.data.idempotentReplay)}</dd>
                      </div>
                    </dl>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(easypaySuccess.data.businessId);
                      }}
                      className="text-xs font-bold text-emerald-800 underline">
                      Copy businessId
                    </button>
                  </div>
                )}
                <form onSubmit={(ev) => void submitEasypayProvision(ev)} className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase" htmlFor="ep-external-id">
                      External user id
                    </label>
                    <input
                      id="ep-external-id"
                      className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                      value={easypayForm.externalUserId}
                      onChange={(e) => setEasypayForm((f) => ({ ...f, externalUserId: e.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase" htmlFor="ep-owner-email">
                      Owner email
                    </label>
                    <input
                      id="ep-owner-email"
                      type="email"
                      className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                      value={easypayForm.ownerEmail}
                      onChange={(e) => setEasypayForm((f) => ({ ...f, ownerEmail: e.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase" htmlFor="ep-owner-name">
                      Owner name
                    </label>
                    <input
                      id="ep-owner-name"
                      className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                      value={easypayForm.ownerName}
                      onChange={(e) => setEasypayForm((f) => ({ ...f, ownerName: e.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase" htmlFor="ep-business-name">
                      Business name
                    </label>
                    <input
                      id="ep-business-name"
                      className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                      value={easypayForm.businessName}
                      onChange={(e) => setEasypayForm((f) => ({ ...f, businessName: e.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase" htmlFor="ep-slug">
                      Slug (optional)
                    </label>
                    <input
                      id="ep-slug"
                      className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                      value={easypayForm.slug}
                      onChange={(e) => setEasypayForm((f) => ({ ...f, slug: e.target.value }))}
                      placeholder="barakahfund"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase" htmlFor="ep-industry">
                      Industry (optional)
                    </label>
                    <input
                      id="ep-industry"
                      className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                      value={easypayForm.industry}
                      onChange={(e) => setEasypayForm((f) => ({ ...f, industry: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase" htmlFor="ep-webhook">
                      Webhook URL override (optional)
                    </label>
                    <input
                      id="ep-webhook"
                      type="url"
                      className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                      value={easypayForm.webhookUrl}
                      onChange={(e) => setEasypayForm((f) => ({ ...f, webhookUrl: e.target.value }))}
                      placeholder="https://…/api/payments/easypay/webhook"
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      Leave blank to omit; DPay will use their default partner webhook if configured.
                    </p>
                  </div>
                  <button
                    type="submit"
                    disabled={easypaySubmitting}
                    className="px-4 py-2.5 rounded-lg bg-brand-600 text-white text-sm font-bold hover:bg-brand-700 disabled:opacity-50">
                    {easypaySubmitting ? 'Provisioning…' : 'Provision on DPay'}
                  </button>
                </form>
              </div>
            </div>
          )}

          {tab === 'audit' && canAccess('audit') && (
            <div className="space-y-4">
              {auditLoadError && (
                <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm font-medium">
                  {auditLoadError}
                </div>
              )}
              {auditExportError && (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm font-medium">
                  {auditExportError}
                </div>
              )}
              <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 flex-1 min-w-0">
                  <div className="sm:col-span-2 xl:col-span-1">
                    <label className="text-xs font-bold text-slate-500 uppercase" htmlFor="audit-type">
                      Event type
                    </label>
                    <select
                      id="audit-type"
                      className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
                      value={auditType}
                      onChange={(e) => setAuditType(e.target.value)}>
                      <option value="">All types</option>
                      {AUDIT_EVENT_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {activityTypeLabel(t)} ({t})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase" htmlFor="audit-from">
                      From
                    </label>
                    <input
                      id="audit-from"
                      type="date"
                      className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
                      value={auditFrom}
                      onChange={(e) => setAuditFrom(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase" htmlFor="audit-to">
                      To
                    </label>
                    <input
                      id="audit-to"
                      type="date"
                      className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
                      value={auditTo}
                      onChange={(e) => setAuditTo(e.target.value)}
                    />
                  </div>
                  <div className="sm:col-span-2 xl:col-span-1">
                    <label className="text-xs font-bold text-slate-500 uppercase" htmlFor="audit-search">
                      Search title / detail
                    </label>
                    <input
                      id="audit-search"
                      type="search"
                      placeholder="Keyword…"
                      className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
                      value={auditSearchInput}
                      onChange={(e) => setAuditSearchInput(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    disabled={auditExportBusy}
                    onClick={() => void handleExportAuditCsv()}
                    className="px-4 py-2.5 rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap">
                    {auditExportBusy ? 'Exporting…' : 'Export CSV'}
                  </button>
                </div>
              </div>
              <p className="text-xs text-slate-500">
                Exports include up to 2,000 rows matching the current filters. The file is UTF‑8 with a BOM for Excel.
              </p>

              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500 font-semibold bg-slate-50">
                        <th className="px-4 py-3 whitespace-nowrap">When</th>
                        <th className="px-4 py-3 whitespace-nowrap">Type</th>
                        <th className="px-4 py-3 min-w-[200px]">Title</th>
                        <th className="px-4 py-3 min-w-[220px]">Detail</th>
                        <th className="px-4 py-3 min-w-[160px]">Actor</th>
                        <th className="px-4 py-3 text-xs font-semibold text-slate-400">Refs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditItems.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-slate-500 text-center">
                            No audit entries match these filters.
                          </td>
                        </tr>
                      ) : (
                        auditItems.map((row) => (
                          <tr key={row.id} className="border-b border-slate-100 last:border-0 align-top">
                            <td className="px-4 py-3 text-slate-600 whitespace-nowrap text-xs">
                              {formatDateTime(row.createdAt)}
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                                {activityTypeLabel(row.type)}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-medium text-slate-900">{row.title}</td>
                            <td className="px-4 py-3 text-slate-600 text-xs whitespace-pre-wrap max-w-md">
                              {row.detail ?? '—'}
                            </td>
                            <td className="px-4 py-3 text-slate-700 text-xs">
                              {row.actor ? (
                                <>
                                  <div className="font-semibold text-slate-900">{row.actor.fullName}</div>
                                  <div className="text-slate-500">{row.actor.email}</div>
                                </>
                              ) : row.actorId ? (
                                <span className="text-slate-400">User removed ({row.actorId.slice(0, 8)}…)</span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-[10px] text-slate-400 font-mono leading-relaxed">
                              {row.campaignId && <div>cmp {row.campaignId.slice(0, 8)}…</div>}
                              {row.userId && <div>usr {row.userId.slice(0, 8)}…</div>}
                              {!row.campaignId && !row.userId && '—'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <AdminPaginator
                  page={auditPage}
                  pageSize={AUDIT_PAGE_SIZE}
                  total={auditTotal}
                  onPageChange={setAuditPage}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {markPaidWithdrawal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mark-paid-title">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 border border-slate-200">
            <h2 id="mark-paid-title" className="text-lg font-display font-bold text-slate-900">
              Mark withdrawal as paid
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Net to pay: <strong className="text-emerald-800">{formatGmd(markPaidWithdrawal.netAmount)}</strong>{' '}
              — {markPaidWithdrawal.campaign.title}
            </p>
            <div className="mt-4 p-3 rounded-xl bg-slate-50 border border-slate-100 text-sm">
              <p className="text-xs font-bold text-slate-500 uppercase">{markPaidWithdrawal.payoutMethodType}</p>
              <p className="text-slate-800 mt-1 break-words">
                {markPaidWithdrawal.payoutDetailsFull ?? 'No payout details on file'}
              </p>
              <p className="text-xs text-slate-500 mt-2">
                Complete the transfer outside the app, then record proof below.
              </p>
            </div>
            <label className="block mt-4 text-sm font-semibold text-slate-700" htmlFor="payout-ref">
              Payout reference <span className="text-red-600">*</span>
            </label>
            <input
              id="payout-ref"
              type="text"
              value={markPaidReference}
              onChange={(e) => setMarkPaidReference(e.target.value)}
              placeholder="e.g. Wave txn ID, bank transfer ref, cash receipt"
              maxLength={255}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
            />
            <label className="block mt-3 text-sm font-semibold text-slate-700" htmlFor="payout-admin-note">
              Admin note (optional)
            </label>
            <input
              id="payout-admin-note"
              type="text"
              value={markPaidAdminNote}
              onChange={(e) => setMarkPaidAdminNote(e.target.value)}
              maxLength={500}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
            />
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setMarkPaidWithdrawal(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-bold text-slate-700">
                Cancel
              </button>
              <button
                type="button"
                disabled={busyWithdrawalId === markPaidWithdrawal.id}
                onClick={() => submitMarkPaid()}
                className="px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm font-bold disabled:opacity-50">
                {busyWithdrawalId === markPaidWithdrawal.id ? 'Saving…' : 'Confirm paid'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
