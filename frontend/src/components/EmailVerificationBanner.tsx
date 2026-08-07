import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MailIcon, XIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';

export function EmailVerificationBanner() {
  const { user, refreshUser, isAuthenticated } = useAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [dismissed, setDismissed] = useState(false);

  if (!isAuthenticated || !user || user.emailVerified || user.role === 'ADMIN' || dismissed) {
    return null;
  }

  const handleResend = async () => {
    setBusy(true);
    setMessage('');
    try {
      const res = await api.resendEmailVerification();
      await refreshUser();
      setMessage(res.message);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not resend email');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-amber-50 border-b border-amber-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <MailIcon className="w-5 h-5 text-amber-800 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-950">
            <p className="font-semibold">Confirm your email to create campaigns and manage payouts</p>
            <p className="text-amber-900/90 mt-0.5">
              We sent a link to <span className="font-medium">{user.email}</span>. You can still browse and
              donate.
              {message ? <span className="block mt-1 font-medium">{message}</span> : null}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 pl-8 sm:pl-0">
          <button
            type="button"
            onClick={() => void handleResend()}
            disabled={busy}
            className="rounded-lg bg-amber-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-900 disabled:opacity-60">
            {busy ? 'Sending…' : 'Resend link'}
          </button>
          <Link
            to="/verify-email"
            className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold text-amber-950 hover:bg-amber-100">
            Help
          </Link>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setDismissed(true)}
            className="p-1.5 text-amber-800/70 hover:text-amber-950">
            <XIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
