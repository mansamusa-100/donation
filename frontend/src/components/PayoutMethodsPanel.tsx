import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PlusIcon, Trash2Icon, StarIcon } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type {
  BankPayoutDetails,
  CashPayoutDetails,
  PayoutMethodType,
  UserPayoutMethod,
  WalletPayoutDetails,
  WalletProvider
} from '../types/payout';

const WALLET_PROVIDERS: WalletProvider[] = ['Wave', 'APS', 'Yonna', 'Other'];

export function PayoutMethodsPanel({ onUpdated }: { onUpdated?: () => void }) {
  const { user } = useAuth();
  const emailVerified = user?.emailVerified !== false;
  const [methods, setMethods] = useState<UserPayoutMethod[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<PayoutMethodType>('Wallet');
  const [label, setLabel] = useState('');
  const [wallet, setWallet] = useState<WalletPayoutDetails>({
    provider: 'Wave',
    mobileNumber: ''
  });
  const [bank, setBank] = useState<BankPayoutDetails>({
    bankName: '',
    accountName: '',
    accountNumber: '',
    branch: ''
  });
  const [cash, setCash] = useState<CashPayoutDetails>({
    recipientName: '',
    phoneNumber: '',
    pickupNotes: ''
  });

  const load = useCallback(async () => {
    setLoadState('loading');
    setError('');
    try {
      const rows = await api.getPayoutMethods();
      setMethods(rows);
      setLoadState('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load payout methods');
      setLoadState('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setLabel('');
    setWallet({ provider: 'Wave', mobileNumber: '' });
    setBank({ bankName: '', accountName: '', accountNumber: '', branch: '' });
    setCash({ recipientName: '', phoneNumber: '', pickupNotes: '' });
    setFormType('Wallet');
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload =
        formType === 'Wallet'
          ? { type: 'Wallet' as const, label: label || undefined, details: wallet }
          : formType === 'Bank'
            ? {
                type: 'Bank' as const,
                label: label || undefined,
                details: {
                  ...bank,
                  branch: bank.branch?.trim() || undefined
                }
              }
            : {
                type: 'Cash' as const,
                label: label || undefined,
                details: {
                  ...cash,
                  pickupNotes: cash.pickupNotes?.trim() || undefined
                }
              };
      await api.createPayoutMethod(payload);
      resetForm();
      setShowForm(false);
      await load();
      onUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save payout method');
    } finally {
      setBusy(false);
    }
  };

  const handleSetDefault = async (id: string) => {
    setBusy(true);
    setError('');
    try {
      await api.updatePayoutMethod(id, { isDefault: true });
      await load();
      onUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Remove this payout method?')) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.deletePayoutMethod(id);
      await load();
      onUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-surface-200 shadow-sm p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-display font-bold text-surface-900">Payout settings</h2>
          <p className="text-sm text-surface-500 mt-1">
            Add how you want to receive withdrawals (wallet, bank, or cash). Admin pays manually using
            these details.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          disabled={busy || !emailVerified}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand-600 text-white text-sm font-bold hover:bg-brand-700 disabled:opacity-50">
          <PlusIcon className="w-4 h-4" />
          {showForm ? 'Cancel' : 'Add method'}
        </button>
      </div>

      {!emailVerified && (
        <p className="text-sm text-amber-900 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-4">
          Verify your email to add or change payout methods.{' '}
          <Link to="/verify-email" className="font-bold underline hover:no-underline">
            Confirm email
          </Link>
        </p>
      )}

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">
          {error}
        </p>
      )}

      {showForm && emailVerified && (
        <form onSubmit={(e) => void handleAdd(e)} className="mb-6 p-4 rounded-xl border border-surface-200 bg-surface-50 space-y-4">
          <div className="flex flex-wrap gap-2">
            {(['Wallet', 'Bank', 'Cash'] as PayoutMethodType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setFormType(t)}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${
                  formType === t
                    ? 'bg-brand-600 text-white'
                    : 'bg-white border border-surface-200 text-surface-700'
                }`}>
                {t}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (optional, e.g. My Wave)"
            maxLength={80}
            className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm"
          />
          {formType === 'Wallet' && (
            <div className="grid sm:grid-cols-2 gap-3">
              <select
                aria-label="Wallet provider"
                value={wallet.provider}
                onChange={(e) =>
                  setWallet((w) => ({ ...w, provider: e.target.value as WalletProvider }))
                }
                className="px-3 py-2 border border-surface-200 rounded-lg text-sm">
                {WALLET_PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <input
                required
                type="tel"
                value={wallet.mobileNumber}
                onChange={(e) => setWallet((w) => ({ ...w, mobileNumber: e.target.value }))}
                placeholder="Mobile number"
                className="px-3 py-2 border border-surface-200 rounded-lg text-sm"
              />
            </div>
          )}
          {formType === 'Bank' && (
            <div className="grid sm:grid-cols-2 gap-3">
              <input
                required
                value={bank.bankName}
                onChange={(e) => setBank((b) => ({ ...b, bankName: e.target.value }))}
                placeholder="Bank name"
                className="px-3 py-2 border border-surface-200 rounded-lg text-sm"
              />
              <input
                required
                value={bank.accountName}
                onChange={(e) => setBank((b) => ({ ...b, accountName: e.target.value }))}
                placeholder="Account name"
                className="px-3 py-2 border border-surface-200 rounded-lg text-sm"
              />
              <input
                required
                value={bank.accountNumber}
                onChange={(e) => setBank((b) => ({ ...b, accountNumber: e.target.value }))}
                placeholder="Account number"
                className="px-3 py-2 border border-surface-200 rounded-lg text-sm"
              />
              <input
                value={bank.branch ?? ''}
                onChange={(e) => setBank((b) => ({ ...b, branch: e.target.value }))}
                placeholder="Branch (optional)"
                className="px-3 py-2 border border-surface-200 rounded-lg text-sm"
              />
            </div>
          )}
          {formType === 'Cash' && (
            <div className="grid sm:grid-cols-2 gap-3">
              <input
                required
                value={cash.recipientName}
                onChange={(e) => setCash((c) => ({ ...c, recipientName: e.target.value }))}
                placeholder="Recipient full name"
                className="px-3 py-2 border border-surface-200 rounded-lg text-sm"
              />
              <input
                required
                type="tel"
                value={cash.phoneNumber}
                onChange={(e) => setCash((c) => ({ ...c, phoneNumber: e.target.value }))}
                placeholder="Phone number"
                className="px-3 py-2 border border-surface-200 rounded-lg text-sm"
              />
              <input
                value={cash.pickupNotes ?? ''}
                onChange={(e) => setCash((c) => ({ ...c, pickupNotes: e.target.value }))}
                placeholder="Pickup notes (optional)"
                className="sm:col-span-2 px-3 py-2 border border-surface-200 rounded-lg text-sm"
              />
            </div>
          )}
          <button
            type="submit"
            disabled={busy}
            className="px-4 py-2 rounded-lg bg-surface-900 text-white text-sm font-bold disabled:opacity-50">
            Save payout method
          </button>
        </form>
      )}

      {loadState === 'loading' && <p className="text-sm text-surface-500">Loading…</p>}
      {loadState === 'ready' && methods.length === 0 && !showForm && (
        <p className="text-sm text-surface-500">No payout methods yet. Add one before requesting a withdrawal.</p>
      )}
      {methods.length > 0 && (
        <ul className="space-y-2">
          {methods.map((m) => (
            <li
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl border border-surface-100 bg-surface-50">
              <div>
                <span className="text-xs font-bold uppercase text-surface-500">{m.type}</span>
                {m.isDefault && (
                  <span className="ml-2 text-xs font-bold text-brand-700 bg-brand-50 px-1.5 py-0.5 rounded">
                    Default
                  </span>
                )}
                <p className="text-sm font-semibold text-surface-900 mt-0.5">{m.summary}</p>
              </div>
              <div className="flex gap-2">
                {!m.isDefault && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleSetDefault(m.id)}
                    className="p-2 rounded-lg border border-surface-200 hover:bg-white disabled:opacity-50"
                    title="Set as default">
                    <StarIcon className="w-4 h-4 text-amber-600" />
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleDelete(m.id)}
                  className="p-2 rounded-lg border border-red-100 text-red-700 hover:bg-red-50 disabled:opacity-50"
                  title="Remove">
                  <Trash2Icon className="w-4 h-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
