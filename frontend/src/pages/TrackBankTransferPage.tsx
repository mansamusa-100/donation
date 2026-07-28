import { FormEvent, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircleIcon, CopyIcon, Loader2Icon, SearchIcon, XCircleIcon } from 'lucide-react';
import { api } from '../lib/api';
import { toUserFriendlyError } from '../lib/userFriendlyError';
import { BankTransferStatusTracker } from '../components/BankTransferStatusTracker';
import type { BankTransferIntentRow } from '../types/bank';

/**
 * Public page: donors enter their bank-transfer reference to see Pending / Confirmed status.
 */
export function TrackBankTransferPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const refFromUrl = searchParams.get('ref')?.trim().toUpperCase() ?? '';

  const [referenceInput, setReferenceInput] = useState(refFromUrl);
  const [intent, setIntent] = useState<BankTransferIntentRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const lookup = async (rawRef: string) => {
    const reference = rawRef.trim().toUpperCase();
    if (!reference) {
      setError('Enter the reference from your bank transfer instructions (e.g. BF-XXXX).');
      setIntent(null);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const row = await api.getBankTransferStatus(reference);
      setIntent(row);
      setSearchParams({ ref: reference }, { replace: true });
    } catch (err) {
      setIntent(null);
      setError(toUserFriendlyError(err, 'We could not find that transfer reference. Check and try again.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!refFromUrl) {
      return;
    }
    setReferenceInput(refFromUrl);
    let cancelled = false;
    setLoading(true);
    setError('');
    void api
      .getBankTransferStatus(refFromUrl)
      .then((row) => {
        if (!cancelled) {
          setIntent(row);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setIntent(null);
          setError(
            toUserFriendlyError(err, 'We could not find that transfer reference. Check and try again.')
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [refFromUrl]);

  useEffect(() => {
    if (!intent || intent.status !== 'Pending') {
      return;
    }
    const id = window.setInterval(() => {
      void api
        .getBankTransferStatus(intent.clientReference)
        .then(setIntent)
        .catch(() => {
          /* keep showing last known status */
        });
    }, 12_000);
    return () => window.clearInterval(id);
  }, [intent?.clientReference, intent?.status]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void lookup(referenceInput);
  };

  const copyReference = async () => {
    if (!intent?.clientReference) {
      return;
    }
    try {
      await navigator.clipboard.writeText(intent.clientReference);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="min-h-[70vh] bg-surface-50 py-10 sm:py-14">
      <div className="max-w-lg mx-auto px-4">
        <div className="text-center mb-8">
          <h1 className="font-display font-bold text-2xl sm:text-3xl text-surface-900">
            Track bank transfer
          </h1>
          <p className="text-surface-600 text-sm mt-2">
            Enter the reference from your transfer instructions or email to see whether it is still pending or
            confirmed.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-surface-200 bg-white p-5 shadow-sm space-y-3 mb-6">
          <label className="block text-sm font-semibold text-surface-800">
            Transfer reference
            <input
              type="text"
              value={referenceInput}
              onChange={(e) => setReferenceInput(e.target.value.toUpperCase())}
              placeholder="e.g. BF-AB12CD34"
              autoComplete="off"
              spellCheck={false}
              className="mt-1.5 w-full rounded-xl border-2 border-surface-200 px-3 py-2.5 font-mono text-sm uppercase tracking-wide focus:border-brand-500 focus:ring-0 outline-none"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-60">
            {loading ? <Loader2Icon className="w-4 h-4 animate-spin" /> : <SearchIcon className="w-4 h-4" />}
            Check status
          </button>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
        </form>

        {intent ? (
          <div className="space-y-4">
            <BankTransferStatusTracker status={intent.status} />

            <div className="rounded-2xl border border-surface-200 bg-white p-5 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-surface-500">Reference</p>
                  <p className="font-mono font-bold text-surface-900 text-lg">{intent.clientReference}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void copyReference()}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs font-bold rounded-lg border border-surface-200 text-surface-700 hover:bg-surface-50">
                  <CopyIcon className="w-3.5 h-3.5" />
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>

              {intent.campaignTitle ? (
                <p className="text-sm text-surface-700">
                  Campaign:{' '}
                  {intent.campaignSlug ? (
                    <Link to={`/campaign/${intent.campaignSlug}`} className="font-semibold text-brand-700 hover:underline">
                      {intent.campaignTitle}
                    </Link>
                  ) : (
                    <strong>{intent.campaignTitle}</strong>
                  )}
                </p>
              ) : null}

              <p className="text-sm text-surface-700">
                Declared amount: <strong>D{intent.declaredAmount.toLocaleString()}</strong>
                {intent.confirmedAmount != null ? (
                  <>
                    {' '}
                    · Confirmed:{' '}
                    <strong className="text-emerald-700">D{intent.confirmedAmount.toLocaleString()}</strong>
                  </>
                ) : null}
              </p>

              {intent.status === 'Pending' ? (
                <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                  Still pending. Complete the transfer at your bank if you have not already, then wait for our team to
                  confirm. Need the account details again?{' '}
                  <Link
                    to={`/payment/bank/pending?ref=${encodeURIComponent(intent.clientReference)}`}
                    className="font-semibold underline hover:no-underline">
                    View instructions
                  </Link>
                  .
                </p>
              ) : null}

              {intent.status === 'Confirmed' ? (
                <div className="flex items-start gap-2 text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
                  <CheckCircleIcon className="w-5 h-5 shrink-0 mt-0.5" />
                  <p>Your donation has been recorded on the campaign. Thank you!</p>
                </div>
              ) : null}

              {(intent.status === 'Rejected' || intent.status === 'Expired') && (
                <div className="flex items-start gap-2 text-sm text-red-800 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                  <XCircleIcon className="w-5 h-5 shrink-0 mt-0.5" />
                  <div>
                    <p>
                      This transfer is <strong>{intent.status.toLowerCase()}</strong>.
                    </p>
                    {intent.adminNote ? <p className="mt-1">{intent.adminNote}</p> : null}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : null}

        <p className="text-center text-sm text-surface-500 mt-8">
          <Link to="/explore" className="font-semibold text-brand-700 hover:underline">
            Explore campaigns
          </Link>
        </p>
      </div>
    </div>
  );
}
