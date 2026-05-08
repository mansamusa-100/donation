import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircleIcon, Loader2Icon, XCircleIcon } from 'lucide-react';
import { api } from '../lib/api';
import type { Campaign } from '../types/campaign';

type Phase = 'loading' | 'success' | 'pending' | 'error';

const MAX_ATTEMPTS = 120;
const RETRY_MS = 2500;

export function PaymentEasypayReturnPage() {
  const [searchParams] = useSearchParams();
  const ref = searchParams.get('ref');

  const [phase, setPhase] = useState<Phase>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [platformTipAmount, setPlatformTipAmount] = useState(0);
  const [campaignDonationAmount, setCampaignDonationAmount] = useState<number | null>(null);

  useEffect(() => {
    if (!ref) {
      setErrorMessage('Missing payment reference. Return to the campaign and try donating again.');
      setPhase('error');
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
              setCampaign(result.campaign);
              setPlatformTipAmount(result.platformTipAmount ?? 0);
              setCampaignDonationAmount(result.campaignDonationAmount ?? null);
              setPhase('success');
            }
            return;
          }
        } catch (e) {
          if (!cancelled) {
            setErrorMessage(e instanceof Error ? e.message : 'Could not confirm payment');
            setPhase('error');
          }
          return;
        }
        await new Promise((r) => setTimeout(r, RETRY_MS));
      }

      if (!cancelled) {
        setPhase('pending');
        setErrorMessage(
          'Payment is still processing. You can close this page; once Easypay confirms, the donation will appear on the campaign (usually within a minute).'
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ref]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 py-16">
      {phase === 'loading' && (
        <div className="text-center max-w-md">
          <Loader2Icon className="w-12 h-12 text-brand-600 animate-spin mx-auto mb-4" />
          <h1 className="font-display font-bold text-xl text-surface-900 mb-2">Confirming your payment</h1>
          <p className="text-surface-600 text-sm">Waiting for Easypay confirmation…</p>
        </div>
      )}

      {phase === 'success' && campaign && (
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
          {ref && (
            <p className="text-xs text-surface-400 font-mono break-all mb-6">Reference: {ref}</p>
          )}
          <Link
            to={`/campaign/${campaign.slug}`}
            className="inline-flex items-center justify-center px-6 py-3 bg-brand-600 text-white font-bold rounded-xl hover:bg-brand-700">
            Back to campaign
          </Link>
        </div>
      )}

      {phase === 'success' && !campaign && (
        <div className="text-center max-w-md">
          <CheckCircleIcon className="w-14 h-14 text-emerald-600 mx-auto mb-4" />
          <p className="text-surface-700 mb-6">Payment confirmed.</p>
          <Link to="/explore" className="text-brand-600 font-bold hover:underline">
            Explore campaigns
          </Link>
        </div>
      )}

      {(phase === 'pending' || phase === 'error') && (
        <div className="text-center max-w-md">
          <XCircleIcon className="w-12 h-12 text-amber-600 mx-auto mb-4" />
          <h1 className="font-display font-bold text-xl text-surface-900 mb-2">
            {phase === 'error' ? 'Something went wrong' : 'Payment pending'}
          </h1>
          <p className="text-surface-600 text-sm mb-6">{errorMessage}</p>
          <div className="flex flex-col gap-2">
            <Link to="/explore" className="text-brand-600 font-bold hover:underline">
              Explore campaigns
            </Link>
            {ref && <p className="text-xs text-surface-400 font-mono break-all">Reference: {ref}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
