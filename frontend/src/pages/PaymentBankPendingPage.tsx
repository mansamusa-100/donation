import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircleIcon, CopyIcon, Loader2Icon, XCircleIcon } from 'lucide-react';
import { api } from '../lib/api';
import type { BankTransferIntentRow } from '../types/bank';

export function PaymentBankPendingPage() {
  const [searchParams] = useSearchParams();
  const ref = searchParams.get('ref')?.trim().toUpperCase() ?? '';

  const [intent, setIntent] = useState<BankTransferIntentRow | null>(null);
  const [loadError, setLoadError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!ref) {
      setLoadError('Missing transfer reference.');
      return;
    }

    let cancelled = false;

    const poll = async () => {
      try {
        const row = await api.getBankTransferStatus(ref);
        if (!cancelled) {
          setIntent(row);
          setLoadError('');
        }
        if (row.status === 'Pending') {
          window.setTimeout(() => void poll(), 8000);
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : 'Could not load transfer status');
        }
      }
    };

    void poll();

    return () => {
      cancelled = true;
    };
  }, [ref]);

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

  if (!ref) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 py-16 text-center max-w-md mx-auto">
        <h1 className="font-display font-bold text-xl text-surface-900 mb-2">Invalid link</h1>
        <p className="text-surface-600 text-sm mb-4">Missing bank transfer reference.</p>
        <Link to="/explore" className="text-brand-600 font-bold hover:underline">
          Explore campaigns
        </Link>
      </div>
    );
  }

  if (loadError && !intent) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 py-16 text-center max-w-md mx-auto space-y-3">
        <h1 className="font-display font-bold text-xl text-surface-900">Could not load</h1>
        <p className="text-surface-600 text-sm">{loadError}</p>
        <Link to="/explore" className="text-brand-600 font-bold hover:underline">
          Explore campaigns
        </Link>
      </div>
    );
  }

  if (!intent) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center gap-2 text-surface-600">
        <Loader2Icon className="w-5 h-5 animate-spin text-brand-600" />
        Loading transfer details…
      </div>
    );
  }

  if (intent.status === 'Confirmed') {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 py-16">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircleIcon className="w-9 h-9 text-emerald-700" />
          </div>
          <h1 className="font-display font-bold text-2xl text-surface-900 mb-2">Thank you!</h1>
          <p className="text-surface-600 mb-6">
            Your bank transfer <strong>{intent.clientReference}</strong> was confirmed
            {intent.confirmedAmount != null ? (
              <>
                {' '}
                for <strong>D{intent.confirmedAmount}</strong>
              </>
            ) : null}
            {intent.campaignTitle ? (
              <>
                {' '}
                to <strong>{intent.campaignTitle}</strong>
              </>
            ) : null}
            .
          </p>
          {intent.campaignSlug ? (
            <Link
              to={`/campaign/${intent.campaignSlug}`}
              className="inline-flex items-center justify-center px-6 py-3 bg-brand-600 text-white font-bold rounded-xl hover:bg-brand-700">
              Back to campaign
            </Link>
          ) : (
            <Link to="/explore" className="text-brand-600 font-bold hover:underline">
              Explore campaigns
            </Link>
          )}
        </div>
      </div>
    );
  }

  if (intent.status === 'Rejected' || intent.status === 'Expired') {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 py-16 text-center max-w-md mx-auto space-y-4">
        <XCircleIcon className="w-14 h-14 text-red-600 mx-auto" />
        <h1 className="font-display font-bold text-xl text-surface-900">
          Transfer {intent.status.toLowerCase()}
        </h1>
        <p className="text-surface-600 text-sm">
          Reference <span className="font-mono font-semibold">{intent.clientReference}</span>
          {intent.adminNote ? (
            <>
              <br />
              <span className="mt-2 block">{intent.adminNote}</span>
            </>
          ) : null}
        </p>
        <Link to="/explore" className="text-brand-600 font-bold hover:underline">
          Explore campaigns
        </Link>
      </div>
    );
  }

  const bank = intent.platformBankAccount;

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 py-16">
      <div className="text-center max-w-lg w-full space-y-5">
        <h1 className="font-display font-bold text-xl text-surface-900">Complete your bank transfer</h1>
        <p className="text-surface-600 text-sm">
          Send funds from your bank using the details below. Put the reference in your transfer remarks exactly as
          shown. We will confirm manually — your donation is not on the campaign until then.
        </p>

        <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4 text-left space-y-2">
          <p className="text-xs font-semibold text-brand-900 uppercase tracking-wide">Your reference</p>
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-lg font-bold text-surface-900">{intent.clientReference}</span>
            <button
              type="button"
              onClick={() => void copyReference()}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-bold rounded-lg bg-white border border-brand-200 text-brand-800 hover:bg-brand-100">
              <CopyIcon className="w-3.5 h-3.5" />
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="text-xs text-surface-600">
            Declared amount: <strong>D{intent.declaredAmount}</strong>
            {intent.platformTipAmount > 0 ? (
              <>
                {' '}
                · Tip on confirm: <strong>D{intent.platformTipAmount}</strong>
              </>
            ) : null}
          </p>
          <p className="text-xs text-amber-800">
            Complete by {new Date(intent.expiresAt).toLocaleString()} (5 days). After that this request expires.
          </p>
        </div>

        {bank ? (
          <div className="rounded-2xl border border-surface-200 bg-white p-4 text-left text-sm space-y-1.5">
            <p className="font-semibold text-surface-900">Transfer to</p>
            {bank.label ? <p className="text-surface-600">{bank.label}</p> : null}
            <p>
              <span className="text-surface-500">Account name:</span> {bank.accountName}
            </p>
            <p>
              <span className="text-surface-500">Bank:</span> {bank.bankName}
            </p>
            <p>
              <span className="text-surface-500">Account number:</span> {bank.accountNumber}
            </p>
            <p>
              <span className="text-surface-500">SWIFT:</span> {bank.swiftCode}
            </p>
            <p>
              <span className="text-surface-500">BBAN:</span> {bank.bban}
            </p>
          </div>
        ) : null}

        <div className="flex items-center justify-center gap-2 text-sm text-surface-500">
          <Loader2Icon className="w-4 h-4 animate-spin text-brand-600" />
          Waiting for admin confirmation…
        </div>

        {intent.campaignSlug ? (
          <Link
            to={`/campaign/${intent.campaignSlug}`}
            className="text-sm font-semibold text-brand-700 hover:underline">
            Back to campaign
          </Link>
        ) : null}
      </div>
    </div>
  );
}
