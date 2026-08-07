import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Loader2Icon, MailIcon } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { BRAND_NAME } from '../lib/brand';

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token')?.trim() ?? '';
  const navigate = useNavigate();
  const { refreshUser, user, isAuthenticated } = useAuth();

  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>(
    token ? 'loading' : 'idle'
  );
  const [error, setError] = useState('');
  const [resendBusy, setResendBusy] = useState(false);
  const [resendMessage, setResendMessage] = useState('');

  useEffect(() => {
    if (!token) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        await api.verifyEmail(token);
        if (cancelled) {
          return;
        }
        await refreshUser();
        if (!cancelled) {
          setStatus('success');
          setTimeout(() => navigate('/dashboard', { replace: true }), 1800);
        }
      } catch (err) {
        if (!cancelled) {
          setStatus('error');
          setError(err instanceof Error ? err.message : 'Verification failed');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, refreshUser, navigate]);

  const handleResend = async () => {
    setResendMessage('');
    setError('');
    if (!isAuthenticated) {
      navigate('/login', { state: { from: { pathname: '/verify-email' } } });
      return;
    }
    setResendBusy(true);
    try {
      const res = await api.resendEmailVerification();
      await refreshUser();
      setResendMessage(res.message);
      if (res.alreadyVerified) {
        setStatus('success');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resend verification email');
    } finally {
      setResendBusy(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-16 bg-surface-50">
      <div className="w-full max-w-md rounded-2xl border border-surface-200 bg-white p-8 shadow-sm text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
          {status === 'success' ? (
            <CheckCircle2 className="h-8 w-8" />
          ) : status === 'loading' ? (
            <Loader2Icon className="h-8 w-8 animate-spin" />
          ) : (
            <MailIcon className="h-8 w-8" />
          )}
        </div>

        <h1 className="font-display text-2xl font-bold text-surface-900 mb-2">
          {status === 'success'
            ? 'Email verified'
            : status === 'loading'
              ? 'Confirming your email…'
              : 'Verify your email'}
        </h1>

        {status === 'loading' ? (
          <p className="text-sm text-surface-600">Just a moment while we confirm your address.</p>
        ) : null}

        {status === 'success' ? (
          <p className="text-sm text-surface-600">
            You’re all set. Redirecting to your dashboard…
          </p>
        ) : null}

        {status === 'idle' ? (
          <div className="space-y-4 text-left">
            <p className="text-sm text-surface-600 text-center">
              {user && !user.emailVerified
                ? `We sent a confirmation link to ${user.email}. Open it to unlock campaigns and payouts on ${BRAND_NAME}.`
                : `Open the confirmation link from your ${BRAND_NAME} email, or request a new one while signed in.`}
            </p>
            {isAuthenticated && user && !user.emailVerified ? (
              <button
                type="button"
                onClick={() => void handleResend()}
                disabled={resendBusy}
                className="w-full rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-60">
                {resendBusy ? 'Sending…' : 'Resend confirmation email'}
              </button>
            ) : (
              <Link
                to="/login"
                className="block w-full rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700 text-center">
                Sign in to resend
              </Link>
            )}
          </div>
        ) : null}

        {status === 'error' ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex gap-2 text-left">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
            {isAuthenticated ? (
              <button
                type="button"
                onClick={() => void handleResend()}
                disabled={resendBusy}
                className="w-full rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-60">
                {resendBusy ? 'Sending…' : 'Send a new confirmation link'}
              </button>
            ) : (
              <Link
                to="/login"
                className="block w-full rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700 text-center">
                Sign in to request a new link
              </Link>
            )}
          </div>
        ) : null}

        {resendMessage ? (
          <p className="mt-4 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
            {resendMessage}
          </p>
        ) : null}

        <p className="mt-6 text-sm text-surface-500">
          <Link to="/dashboard" className="font-semibold text-brand-700 hover:underline">
            Back to dashboard
          </Link>
        </p>
      </div>
    </div>
  );
}
