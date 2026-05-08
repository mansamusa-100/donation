import { useEffect, useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircleIcon, ExternalLinkIcon, Loader2Icon } from 'lucide-react';
import { api } from '../lib/api';
import {
  clearEasypayPendingLaunchUrl,
  getEasypayPendingLaunchUrl
} from '../lib/easypayPendingStorage';
import type { Campaign } from '../types/campaign';

/** ~5 minutes — webhook after wallet can be delayed. */
const MAX_ATTEMPTS = 120;
const RETRY_MS = 2500;

export function PaymentEasypayPendingPage() {
  const [searchParams] = useSearchParams();
  const ref = searchParams.get('ref');

  const [launchUrl, setLaunchUrl] = useState<string | null>(null);
  const [statusPhase, setStatusPhase] = useState<'checking' | 'success' | 'long_wait' | 'error'>(
    'checking'
  );
  const [errorMessage, setErrorMessage] = useState('');
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [platformTipAmount, setPlatformTipAmount] = useState(0);
  const [campaignDonationAmount, setCampaignDonationAmount] = useState<number | null>(null);

  useEffect(() => {
    if (!ref) {
      return;
    }
    setLaunchUrl(getEasypayPendingLaunchUrl(ref));
  }, [ref]);

  const openWallet = useCallback(() => {
    if (!launchUrl) {
      return;
    }
    window.location.href = launchUrl;
  }, [launchUrl]);

  useEffect(() => {
    if (!ref) {
      setErrorMessage('Missing payment reference. Return to the campaign and donate again.');
      setStatusPhase('error');
      return;
    }

    let cancelled = false;

    (async () => {
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        if (cancelled) {
          return;
        }
        try {
          const result = await api.getEasypayPaymentStatus(ref);
          if (result.status === 'succeeded') {
            if (!cancelled) {
              clearEasypayPendingLaunchUrl(ref);
              setCampaign(result.campaign);
              setPlatformTipAmount(result.platformTipAmount ?? 0);
              setCampaignDonationAmount(result.campaignDonationAmount ?? null);
              setStatusPhase('success');
            }
            return;
          }
        } catch (e) {
          if (!cancelled) {
            setErrorMessage(e instanceof Error ? e.message : 'Could not check payment status');
            setStatusPhase('error');
          }
          return;
        }
        await new Promise((r) => setTimeout(r, RETRY_MS));
      }

      if (!cancelled) {
        setStatusPhase('long_wait');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ref]);

  if (!ref) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 py-16 text-center max-w-md mx-auto">
        <h1 className="font-display font-bold text-xl text-surface-900 mb-2">Invalid link</h1>
        <p className="text-surface-600 text-sm mb-4">Missing payment reference.</p>
        <Link to="/explore" className="text-brand-600 font-bold hover:underline">
          Explore campaigns
        </Link>
      </div>
    );
  }

  if (statusPhase === 'success' && campaign) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 py-16">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircleIcon className="w-9 h-9 text-emerald-700" />
          </div>
          <h1 className="font-display font-bold text-2xl text-surface-900 mb-2">Thank you!</h1>
          <p className="text-surface-600 mb-6">
            Your payment was recorded for <strong>{campaign.title}</strong>
            {campaignDonationAmount != null && (
              <>
                {' '}
                (<strong>D{campaignDonationAmount}</strong> to the campaign
                {platformTipAmount > 0 ? (
                  <>
                    , plus <strong>D{platformTipAmount}</strong> voluntary platform support
                  </>
                ) : null}
                ).
              </>
            )}
          </p>
          <Link
            to={`/campaign/${campaign.slug}`}
            className="inline-flex items-center justify-center px-6 py-3 bg-brand-600 text-white font-bold rounded-xl hover:bg-brand-700">
            Back to campaign
          </Link>
        </div>
      </div>
    );
  }

  if (statusPhase === 'success' && !campaign) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 py-16 text-center">
        <CheckCircleIcon className="w-14 h-14 text-emerald-600 mx-auto mb-4" />
        <p className="text-surface-700 mb-6">Payment confirmed.</p>
        <Link to="/explore" className="text-brand-600 font-bold hover:underline">
          Explore campaigns
        </Link>
      </div>
    );
  }

  if (statusPhase === 'error') {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 py-16 text-center max-w-md mx-auto space-y-3">
        <h1 className="font-display font-bold text-xl text-surface-900">Could not verify</h1>
        <p className="text-surface-600 text-sm">{errorMessage}</p>
        <p className="text-xs text-surface-400 font-mono break-all">Reference: {ref}</p>
        <Link to="/explore" className="text-brand-600 font-bold hover:underline">
          Explore campaigns
        </Link>
      </div>
    );
  }

  if (statusPhase === 'long_wait') {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 py-16 text-center max-w-md mx-auto space-y-4">
        <h1 className="font-display font-bold text-xl text-surface-900">Still processing</h1>
        <p className="text-surface-600 text-sm">
          If your wallet was debited, Easypay may still be notifying us. Check the campaign page — the donation usually
          appears within a minute. Keep this reference if you contact support.
        </p>
        <p className="text-xs text-surface-400 font-mono break-all">Reference: {ref}</p>
        <div className="flex flex-col gap-2">
          <Link to="/explore" className="text-brand-600 font-bold hover:underline">
            Explore campaigns
          </Link>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="text-sm font-semibold text-surface-700 underline">
            Refresh this page to check again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 py-16">
      <div className="text-center max-w-md space-y-5">
        <h1 className="font-display font-bold text-xl text-surface-900">Finish paying in your wallet</h1>
        <p className="text-surface-600 text-sm">
          Use the button below to open Easypay / your wallet. After you approve,{' '}
          <strong>keep this tab open</strong> — we&apos;ll show a thank-you as soon as Easypay confirms (your campaign
          only updates after that webhook).
        </p>
        {launchUrl ? (
          <button
            type="button"
            onClick={() => openWallet()}
            className="inline-flex items-center justify-center gap-2 w-full px-6 py-3 bg-brand-600 text-white font-bold rounded-xl hover:bg-brand-700">
            <ExternalLinkIcon className="w-5 h-5" />
            Open payment in wallet
          </button>
        ) : (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
            Payment link wasn&apos;t stored (new tab, another device, or private mode). If you already paid elsewhere,
            stay here — we&apos;re still checking with your reference.
          </p>
        )}
        <div className="flex items-center justify-center gap-2 text-sm text-surface-500">
          <Loader2Icon className="w-4 h-4 animate-spin text-brand-600" />
          Waiting for Easypay confirmation…
        </div>
        <p className="text-xs text-surface-400 font-mono break-all">Reference: {ref}</p>
      </div>
    </div>
  );
}
