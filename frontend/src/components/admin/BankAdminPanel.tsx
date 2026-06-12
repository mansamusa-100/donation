import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { BankTransferIntentRow, PlatformBankAccount } from '../../types/bank';

const PAGE_SIZE = 12;

function formatGmd(n: number) {
  return `D${n.toLocaleString()}`;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString();
}

function statusBadge(status: string) {
  switch (status) {
    case 'Pending':
      return 'bg-amber-100 text-amber-900';
    case 'Confirmed':
      return 'bg-emerald-100 text-emerald-900';
    case 'Rejected':
      return 'bg-red-100 text-red-900';
    case 'Expired':
      return 'bg-slate-200 text-slate-700';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}

const emptyAccountForm = {
  label: '',
  accountName: '',
  bankName: '',
  accountNumber: '',
  swiftCode: '',
  bban: '',
  isActive: true,
  sortOrder: 0
};

export function BankAdminPanel() {
  const [transfers, setTransfers] = useState<BankTransferIntentRow[]>([]);
  const [transfersTotal, setTransfersTotal] = useState(0);
  const [transfersPage, setTransfersPage] = useState(1);
  const [transferFilter, setTransferFilter] = useState<'Pending' | ''>('Pending');
  const [accounts, setAccounts] = useState<PlatformBankAccount[]>([]);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmIntent, setConfirmIntent] = useState<BankTransferIntentRow | null>(null);
  const [receivedAmount, setReceivedAmount] = useState('');
  const [adminNote, setAdminNote] = useState('');
  const [accountForm, setAccountForm] = useState(emptyAccountForm);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [accountSubmitting, setAccountSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const [acc, tr] = await Promise.all([
        api.getAdminPlatformBankAccounts(),
        api.getAdminBankTransfers({
          page: transfersPage,
          pageSize: PAGE_SIZE,
          ...(transferFilter ? { status: transferFilter } : {})
        })
      ]);
      setAccounts(acc);
      setTransfers(tr.items);
      setTransfersTotal(tr.total);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load bank data');
    }
  }, [transfersPage, transferFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleConfirm = async () => {
    if (!confirmIntent) {
      return;
    }
    const amt = Math.round(Number.parseFloat(receivedAmount) * 100) / 100;
    if (!Number.isFinite(amt) || amt < 1) {
      setActionError('Enter the amount you received (at least D1).');
      return;
    }
    setActionError('');
    setBusyId(confirmIntent.id);
    try {
      await api.confirmAdminBankTransfer(confirmIntent.id, {
        receivedAmount: amt,
        adminNote: adminNote.trim() || undefined
      });
      setConfirmIntent(null);
      setReceivedAmount('');
      setAdminNote('');
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Confirm failed');
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (intent: BankTransferIntentRow) => {
    if (!window.confirm(`Reject transfer ${intent.clientReference}?`)) {
      return;
    }
    setBusyId(intent.id);
    setActionError('');
    try {
      await api.rejectAdminBankTransfer(intent.id, {
        adminNote: adminNote.trim() || undefined
      });
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Reject failed');
    } finally {
      setBusyId(null);
    }
  };

  const submitAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setAccountSubmitting(true);
    setActionError('');
    try {
      const payload = {
        label: accountForm.label.trim() || null,
        accountName: accountForm.accountName.trim(),
        bankName: accountForm.bankName.trim(),
        accountNumber: accountForm.accountNumber.trim(),
        swiftCode: accountForm.swiftCode.trim(),
        bban: accountForm.bban.trim(),
        isActive: accountForm.isActive,
        sortOrder: accountForm.sortOrder
      };
      if (editingAccountId) {
        await api.updateAdminPlatformBankAccount(editingAccountId, payload);
      } else {
        await api.createAdminPlatformBankAccount(payload);
      }
      setAccountForm(emptyAccountForm);
      setEditingAccountId(null);
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not save account');
    } finally {
      setAccountSubmitting(false);
    }
  };

  const startEditAccount = (a: PlatformBankAccount) => {
    setEditingAccountId(a.id);
    setAccountForm({
      label: a.label ?? '',
      accountName: a.accountName,
      bankName: a.bankName,
      accountNumber: a.accountNumber,
      swiftCode: a.swiftCode,
      bban: a.bban,
      isActive: a.isActive,
      sortOrder: a.sortOrder
    });
  };

  const totalPages = Math.max(1, Math.ceil(transfersTotal / PAGE_SIZE));

  return (
    <div className="space-y-8">
      {loadError && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">{loadError}</div>
      )}
      {actionError && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">{actionError}</div>
      )}

      <form
        onSubmit={(e) => void submitAccount(e)}
        className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4 max-w-2xl">
        <h2 className="font-display font-bold text-slate-900">
          {editingAccountId ? 'Edit receiving account' : 'Add receiving account'}
        </h2>
        <p className="text-sm text-slate-600">
          Donors pick one of the active accounts when starting a bank transfer. At least one active account is
          required for bank donations to appear.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <label className="block sm:col-span-2">
            <span className="text-xs font-bold text-slate-500 uppercase">Label (optional)</span>
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              value={accountForm.label}
              onChange={(e) => setAccountForm((f) => ({ ...f, label: e.target.value }))}
            />
          </label>
          {(['accountName', 'bankName', 'accountNumber', 'swiftCode', 'bban'] as const).map((key) => (
            <label key={key} className="block">
              <span className="text-xs font-bold text-slate-500 uppercase">{key}</span>
              <input
                required
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                value={accountForm[key]}
                onChange={(e) => setAccountForm((f) => ({ ...f, [key]: e.target.value }))}
              />
            </label>
          ))}
          <label className="block">
            <span className="text-xs font-bold text-slate-500 uppercase">Sort order</span>
            <input
              type="number"
              min={0}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              value={accountForm.sortOrder}
              onChange={(e) =>
                setAccountForm((f) => ({ ...f, sortOrder: Number.parseInt(e.target.value, 10) || 0 }))
              }
            />
          </label>
          <label className="flex items-center gap-2 pt-6">
            <input
              type="checkbox"
              checked={accountForm.isActive}
              onChange={(e) => setAccountForm((f) => ({ ...f, isActive: e.target.checked }))}
            />
            <span className="font-medium text-slate-700">Active</span>
          </label>
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={accountSubmitting}
            className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-bold disabled:opacity-50">
            {accountSubmitting ? 'Saving…' : editingAccountId ? 'Update account' : 'Add account'}
          </button>
          {editingAccountId ? (
            <button
              type="button"
              onClick={() => {
                setEditingAccountId(null);
                setAccountForm(emptyAccountForm);
              }}
              className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-bold text-slate-700">
              Cancel edit
            </button>
          ) : null}
        </div>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
          <h2 className="font-display font-bold text-slate-900">Receiving accounts</h2>
        </div>
        {accounts.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">No accounts yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {accounts.map((a) => (
              <li key={a.id} className="px-4 py-3 flex flex-wrap items-start justify-between gap-2 text-sm">
                <div>
                  <div className="font-bold text-slate-900">
                    {a.label || a.bankName}{' '}
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded-md ${a.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                      {a.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="text-slate-600 text-xs mt-1">
                    {a.accountName} · {a.accountNumber}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => startEditAccount(a)}
                  className="text-xs font-bold text-brand-700 hover:underline">
                  Edit
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display font-bold text-slate-900">Bank transfers</h2>
          <select
            aria-label="Filter bank transfers by status"
            value={transferFilter}
            onChange={(e) => {
              setTransferFilter(e.target.value as 'Pending' | '');
              setTransfersPage(1);
            }}
            className="text-sm rounded-lg border border-slate-200 px-2 py-1">
            <option value="Pending">Pending only</option>
            <option value="">All statuses</option>
          </select>
        </div>
        {transfers.length === 0 ? (
          <p className="p-8 text-sm text-slate-500">No transfers in this view.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500 font-semibold bg-slate-50">
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Campaign</th>
                  <th className="px-4 py-3">Donor</th>
                  <th className="px-4 py-3">Declared</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Expires</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((t) => (
                  <tr key={t.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 font-mono text-xs font-bold">{t.clientReference}</td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-900">{t.campaignTitle}</div>
                      <div className="text-xs text-slate-500">{t.campaignSlug}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div>{t.donorName}</div>
                      {t.donorEmail ? <div className="text-xs text-slate-500">{t.donorEmail}</div> : null}
                    </td>
                    <td className="px-4 py-3">
                      {formatGmd(t.declaredAmount)}
                      {t.platformTipAmount > 0 ? (
                        <div className="text-xs text-slate-500">Tip: {formatGmd(t.platformTipAmount)}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${statusBadge(t.status)}`}>
                        {t.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                      {formatDateTime(t.expiresAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {t.status === 'Pending' ? (
                        <div className="flex flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            disabled={busyId === t.id}
                            onClick={() => {
                              setConfirmIntent(t);
                              setReceivedAmount(String(t.declaredAmount));
                              setAdminNote('');
                              setActionError('');
                            }}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-700 text-white disabled:opacity-50">
                            Confirm
                          </button>
                          <button
                            type="button"
                            disabled={busyId === t.id}
                            onClick={() => void handleReject(t)}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold text-red-700 border border-red-200 disabled:opacity-50">
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50/80 text-xs text-slate-500">
          <span>
            Page {transfersPage} of {totalPages} ({transfersTotal} total)
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={transfersPage <= 1}
              onClick={() => setTransfersPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-bold disabled:opacity-40">
              Prev
            </button>
            <button
              type="button"
              disabled={transfersPage >= totalPages}
              onClick={() => setTransfersPage((p) => p + 1)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-bold disabled:opacity-40">
              Next
            </button>
          </div>
        </div>
      </div>

      {confirmIntent ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-4">
            <h3 className="font-display font-bold text-slate-900">Confirm bank transfer</h3>
            <p className="text-sm text-slate-600">
              Reference <span className="font-mono font-bold">{confirmIntent.clientReference}</span> — enter the
              amount you actually received (can differ from declared D{confirmIntent.declaredAmount}).
            </p>
            <label className="block text-sm">
              <span className="text-xs font-bold text-slate-500 uppercase">Received amount (GMD)</span>
              <input
                type="number"
                min={1}
                step="0.01"
                inputMode="decimal"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                value={receivedAmount}
                onChange={(e) => setReceivedAmount(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="text-xs font-bold text-slate-500 uppercase">Admin note (optional)</span>
              <textarea
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                rows={2}
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
              />
            </label>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setConfirmIntent(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-bold">
                Cancel
              </button>
              <button
                type="button"
                disabled={busyId === confirmIntent.id}
                onClick={() => void handleConfirm()}
                className="px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm font-bold disabled:opacity-50">
                {busyId === confirmIntent.id ? 'Saving…' : 'Confirm & record donation'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
