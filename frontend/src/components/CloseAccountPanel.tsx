import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangleIcon, Loader2Icon, XIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { GoogleSignInButton } from './GoogleSignInButton';

/**
 * Self-service account closure (organizers and donors).
 * Starts collapsed; expands into the full flow on demand.
 */
export function CloseAccountPanel() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [eligibility, setEligibility] = useState<{ canClose: boolean; blockers: string[] } | null>(
    null
  );
  const [loadingEligibility, setLoadingEligibility] = useState(false);
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadEligibility = useCallback(async () => {
    setLoadingEligibility(true);
    setError('');
    try {
      const data = await api.getCloseAccountEligibility();
      setEligibility(data);
    } catch (err) {
      setEligibility({
        canClose: false,
        blockers: [err instanceof Error ? err.message : 'Could not check eligibility']
      });
    } finally {
      setLoadingEligibility(false);
    }
  }, []);

  const handleOpen = () => {
    setExpanded(true);
    if (eligibility === null && !loadingEligibility) {
      void loadEligibility();
    }
  };

  const handleCancel = () => {
    setExpanded(false);
    setConfirmPhrase('');
    setPassword('');
    setError('');
  };

  if (!user || user.role === 'ADMIN') {
    return null;
  }

  const handleClose = async () => {
    if (confirmPhrase !== 'CLOSE') {
      setError('Type CLOSE in capital letters to confirm.');
      return;
    }
    if (!password.trim()) {
      setError('Enter your password, or use the Google button below if you sign in with Google only.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      await api.closeAccount({
        confirmPhrase: 'CLOSE',
        password: password.trim()
      });
      await logout();
      navigate('/', { replace: true, state: { accountClosed: true } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not close account');
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleClose = async (credential: string) => {
    if (confirmPhrase !== 'CLOSE') {
      setError('Type CLOSE in capital letters to confirm.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      await api.closeAccount({
        confirmPhrase: 'CLOSE',
        googleCredential: credential
      });
      await logout();
      navigate('/', { replace: true, state: { accountClosed: true } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not close account');
    } finally {
      setBusy(false);
    }
  };

  if (!expanded) {
    return (
      <div className="rounded-2xl border border-surface-200 bg-white p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-lg font-display font-bold text-surface-900">Account</h2>
            <p className="text-sm text-surface-500 mt-1">
              Need to leave BarakahFund? You can permanently close your account from here.
            </p>
          </div>
          <button
            type="button"
            onClick={handleOpen}
            className="shrink-0 inline-flex items-center justify-center rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50 transition-colors">
            Close account…
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-red-200 bg-red-50/50 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <AlertTriangleIcon className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-lg font-display font-bold text-surface-900">Close account</h2>
            <button
              type="button"
              onClick={handleCancel}
              disabled={busy}
              className="shrink-0 rounded-lg p-1.5 text-surface-500 hover:bg-white/80 hover:text-surface-800 disabled:opacity-60"
              aria-label="Cancel and go back">
              <XIcon className="h-5 w-5" />
            </button>
          </div>
          <p className="text-sm text-surface-600 mt-1">
            Permanently close your BarakahFund account. This cannot be undone from the app.
          </p>

          <ul className="mt-3 text-sm text-surface-700 list-disc pl-5 space-y-1">
            <li>You will be signed out and unable to log in again with this account.</li>
            <li>Your profile details (name, email, phone, photo) will be removed from our systems.</li>
            <li>
              Live campaigns you created will be taken offline immediately. Donation and payout records
              are kept for compliance.
            </li>
          </ul>

          {loadingEligibility && (
            <p className="mt-4 text-sm text-surface-500 flex items-center gap-2">
              <Loader2Icon className="h-4 w-4 animate-spin" /> Checking whether you can close now…
            </p>
          )}

          {!loadingEligibility && eligibility && eligibility.blockers.length > 0 && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm font-semibold text-amber-900">Resolve these before closing:</p>
              <ul className="mt-2 text-sm text-amber-900 list-disc pl-5 space-y-1">
                {eligibility.blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => void loadEligibility()}
                className="mt-3 text-sm font-semibold text-amber-900 underline hover:no-underline">
                Check again
              </button>
            </div>
          )}

          {!loadingEligibility && eligibility?.canClose && (
            <div className="mt-5 space-y-4 border-t border-red-100 pt-5">
              <label className="block text-sm">
                <span className="font-medium text-surface-800">
                  Type <span className="font-mono font-bold">CLOSE</span> to confirm
                </span>
                <input
                  type="text"
                  value={confirmPhrase}
                  onChange={(e) => setConfirmPhrase(e.target.value)}
                  className="mt-1 w-full max-w-xs rounded-lg border border-surface-200 px-3 py-2 text-sm"
                  autoComplete="off"
                  disabled={busy}
                />
              </label>

              <label className="block text-sm max-w-xs">
                <span className="font-medium text-surface-800">Password (email sign-in)</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-surface-200 px-3 py-2 text-sm"
                  autoComplete="current-password"
                  disabled={busy}
                />
              </label>

              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <button
                  type="button"
                  onClick={() => void handleClose()}
                  disabled={busy}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60">
                  {busy ? <Loader2Icon className="h-4 w-4 animate-spin" /> : null}
                  Close my account
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={busy}
                  className="inline-flex items-center justify-center rounded-xl border border-surface-200 bg-white px-4 py-2.5 text-sm font-semibold text-surface-700 hover:bg-surface-50 disabled:opacity-60">
                  Cancel
                </button>
              </div>

              <div className="flex items-center gap-3 max-w-xs">
                <div className="h-px flex-1 bg-red-100" />
                <span className="text-xs font-semibold uppercase text-surface-400">or</span>
                <div className="h-px flex-1 bg-red-100" />
              </div>

              <p className="text-xs text-surface-500">Google sign-in only? Confirm with Google:</p>
              <GoogleSignInButton
                text="continue_with"
                onCredential={(credential) => void handleGoogleClose(credential)}
                onError={setError}
              />
            </div>
          )}

          {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
        </div>
      </div>
    </div>
  );
}
