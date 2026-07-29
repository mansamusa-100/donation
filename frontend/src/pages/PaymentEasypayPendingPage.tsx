import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { CheckCircleIcon, ExternalLinkIcon, Loader2Icon, QrCodeIcon } from 'lucide-react';
import { api } from '../lib/api';
import {
  clearEasypayPendingWalletSession,
  getEasypayPendingWalletSession,
  type EasypayPendingWalletSession
} from '../lib/easypayPendingStorage';
import { isCoarseMobileDevice } from '../lib/device';
import type { Campaign } from '../types/campaign';

/** ~5 minutes — webhook after wallet can be delayed. */
const MAX_ATTEMPTS = 120;
const RETRY_MS = 2500;

export function PaymentEasypayPendingPage() {
  const [searchParams] = useSearchParams();
  const ref = searchParams.get('ref');

  const [session, setSession] = useState<EasypayPendingWalletSession | null>(null);
  const mobile = useMemo(() => (typeof window !== 'undefined' ? isCoarseMobileDevice() : false), []);
  const [showMobileQr, setShowMobileQr] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

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
    setSession(getEasypayPendingWalletSession(ref));
  }, [ref]);

  const qrPayload = session?.qrPayload?.trim() || null;
  const launchUrl = session?.launchUrl ?? null;

  useEffect(() => {
    if (!qrPayload) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(qrPayload, { margin: 2, width: 256, errorCorrectionLevel: 'M' })
      .then((url) => {
        if (!cancelled) {
          setQrDataUrl(url);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQrDataUrl(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [qrPayload]);

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
              clearEasypayPendingWalletSession(ref);
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
          If your wallet was debited, DPay may still be notifying us. Check the campaign page — the donation usually
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
      <div className="text-center max-w-lg w-full space-y-5">
        <h1 className="font-display font-bold text-xl text-surface-900">
          {mobile ? 'Finish paying in your wallet' : 'Complete your payment'}
        </h1>
        <p className="text-surface-600 text-sm">
          {mobile
            ? 'Open your wallet app to approve. After you pay, keep this page open — we will confirm as soon as DPay notifies us.'
            : 'On desktop, open your wallet with the button below or scan the QR code. Keep this tab open until you see the thank-you message.'}
        </p>

        {!mobile && qrDataUrl ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-surface-200 bg-surface-50 py-6 px-4">
            <QrCodeIcon className="w-8 h-8 text-surface-600" aria-hidden />
            <p className="text-sm font-semibold text-surface-800">Scan with your wallet app</p>
            <img src={qrDataUrl} alt="QR code to complete payment in your wallet" className="rounded-xl" width={256} height={256} />
          </div>
        ) : null}

        {mobile && (showMobileQr || !launchUrl) && qrDataUrl ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-surface-200 bg-surface-50 py-4 px-4">
            <p className="text-sm font-semibold text-surface-800">Scan with another device</p>
            <img src={qrDataUrl} alt="QR code to complete payment" className="rounded-xl" width={220} height={220} />
          </div>
        ) : null}

        {launchUrl ? (
          <button
            type="button"
            onClick={() => openWallet()}
            className="inline-flex items-center justify-center gap-2 w-full px-6 py-3 bg-brand-600 text-white font-bold rounded-xl hover:bg-brand-700">
            <ExternalLinkIcon className="w-5 h-5" />
            {mobile ? 'Open wallet app' : 'Open wallet on this device'}
          </button>
        ) : (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
            Payment link wasn&apos;t stored (new tab, another device, or private mode). If you already paid elsewhere,
            stay here — we&apos;re still checking with your reference.
          </p>
        )}

        {mobile && launchUrl && qrDataUrl && !showMobileQr ? (
          <button
            type="button"
            onClick={() => setShowMobileQr(true)}
            className="text-sm font-semibold text-brand-700 hover:underline">
            Pay using a QR code instead
          </button>
        ) : null}

        {!mobile && !qrDataUrl && launchUrl ? (
          <p className="text-xs text-surface-500">
            No QR was returned for this order — use the button above to open your wallet, or donate from your phone.
          </p>
        ) : null}

        <div className="flex items-center justify-center gap-2 text-sm text-surface-500">
          <Loader2Icon className="w-4 h-4 animate-spin text-brand-600" />
          Waiting for DPay confirmation…
        </div>
        <p className="text-xs text-surface-400 font-mono break-all">Reference: {ref}</p>
      </div>
    </div>
  );
}
