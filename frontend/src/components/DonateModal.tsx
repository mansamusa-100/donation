import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  XIcon,
  HeartIcon,
  SmartphoneIcon,
  Wallet,
  Landmark,
  Building2,
  CheckCircleIcon,
  SparklesIcon
} from 'lucide-react';
import type { PlatformBankAccount } from '../types/bank';
import { useAuth } from '../context/AuthContext';
import { BRAND_NAME } from '../lib/brand';
import { api } from '../lib/api';
import { setEasypayPendingWalletSession } from '../lib/easypayPendingStorage';

interface DonateModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaignTitle: string;
  campaignSlug?: string;
}

const PRESET_AMOUNTS = [50, 100, 250, 500, 1000];
const PRESET_PLATFORM_TIPS = [0, 10, 25, 50];
const MAX_PLATFORM_TIP = 100_000;

type WalletId = 'wave' | 'aps' | 'yonna';
type PaymentMethodId = WalletId | 'bank';

type PaymentProviderInfo = {
  id: WalletId | 'bank';
  label: string;
  configured: boolean;
  checkoutLive: boolean;
};

export function DonateModal({
  isOpen,
  onClose,
  campaignTitle,
  campaignSlug
}: DonateModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [amount, setAmount] = useState<number | ''>('');
  const [platformTipAmount, setPlatformTipAmount] = useState(0);
  const [donorName, setDonorName] = useState('');
  const [donorEmail, setDonorEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [paymentWallet, setPaymentWallet] = useState<PaymentMethodId>('wave');
  const [paymentProviders, setPaymentProviders] = useState<PaymentProviderInfo[] | null>(null);
  const [platformBankAccounts, setPlatformBankAccounts] = useState<PlatformBankAccount[] | null>(null);
  const [selectedBankAccountId, setSelectedBankAccountId] = useState('');
  const [easypayCheckout, setEasypayCheckout] = useState(false);
  const [yonnaPhone, setYonnaPhone] = useState('');
  const [easypayApsGatewayCode, setEasypayApsGatewayCode] = useState<string | null>(null);
  const [easypayApsBookingId, setEasypayApsBookingId] = useState<string | null>(null);
  const [apsPhase, setApsPhase] = useState<'idle' | 'auth' | 'otp'>('idle');
  const [apsMobile, setApsMobile] = useState('');
  const [apsAuthState, setApsAuthState] = useState('');
  const [apsOtp, setApsOtp] = useState('');
  const [apsRequiresOtp, setApsRequiresOtp] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');

  const { user } = useAuth();

  useEffect(() => {
    if (!isOpen || isAnonymous || !user?.fullName) {
      return;
    }
    setDonorName((prev) => (prev.trim() ? prev : user.fullName));
  }, [isOpen, isAnonymous, user?.fullName]);

  useEffect(() => {
    if (!isOpen || !user?.email) {
      return;
    }
    setDonorEmail((prev) => (prev.trim() ? prev : user.email));
  }, [isOpen, user?.email]);

  useEffect(() => {
    if (!isOpen || step !== 2) {
      return;
    }
    let cancelled = false;
    void api
      .getPaymentProviders()
      .then((res) => {
        if (!cancelled) {
          setPaymentProviders(res.providers);
          setEasypayCheckout(res.easypayCheckout === true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPaymentProviders([]);
          setEasypayCheckout(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, step]);

  useEffect(() => {
    if (!isOpen || step !== 2 || paymentWallet !== 'bank') {
      return;
    }
    let cancelled = false;
    void api
      .getPlatformBankAccounts()
      .then((rows) => {
        if (!cancelled) {
          setPlatformBankAccounts(rows);
          setSelectedBankAccountId((prev) =>
            prev && rows.some((r) => r.id === prev) ? prev : ''
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPlatformBankAccounts([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, step, paymentWallet]);

  if (!isOpen) return null;

  /** Donation amount rounded to 2 decimal places (bututs). */
  const donationAmount = Math.round((Number(amount) || 0) * 100) / 100;
  /** Total the donor is charged (donation + tip), rounded for clean display. */
  const chargeTotal = Math.round((donationAmount + platformTipAmount) * 100) / 100;

  const validateParticipantDetails = (): boolean => {
    if (!donationAmount || donationAmount < 1) {
      setError('Please enter a valid amount (at least D1)');
      return false;
    }
    if (platformTipAmount < 0 || platformTipAmount > MAX_PLATFORM_TIP) {
      setError(`Platform tip must be between 0 and D${MAX_PLATFORM_TIP.toLocaleString()}`);
      return false;
    }

    const resolvedName = isAnonymous
      ? 'Anonymous'
      : (donorName.trim() || user?.fullName?.trim() || '');

    if (!isAnonymous && resolvedName.length < 2) {
      setError('Please enter your name, or mark as anonymous');
      return false;
    }

    if (!campaignSlug) {
      setError('Campaign information missing');
      return false;
    }

    return true;
  };

  const donatePayloadBase = () => ({
    campaignSlug: campaignSlug!,
    amount: donationAmount,
    ...(platformTipAmount > 0 ? { platformTipAmount } : {}),
    currency: 'GMD' as const,
    ...(isAnonymous ? {} : donorName.trim() ? { donorName: donorName.trim() } : {}),
    message: message || undefined,
    isAnonymous
  });

  const handlePayWithWave = async () => {
    if (!validateParticipantDetails()) {
      return;
    }

    setError('');
    setIsProcessing(true);

    try {
      if (easypayCheckout) {
        const res = await api.easypayPartnerCheckout({
          ...donatePayloadBase(),
          channel: 'wave'
        });
        if (res.kind !== 'redirect') {
          setError('Unexpected DPay response for Wave.');
          setIsProcessing(false);
          return;
        }
        setEasypayPendingWalletSession(res.partnerExternalBookingId, {
          launchUrl: res.launchUrl,
          qrPayload: res.qrPayload,
          paymentHtml: res.paymentHtml ?? undefined
        });
        const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');
        window.location.assign(
          `${window.location.origin}${base}/payment/easypay/pending?ref=${encodeURIComponent(res.partnerExternalBookingId)}`
        );
        return;
      }

      const session = await api.createWaveCheckoutSession(donatePayloadBase());
      window.location.assign(session.waveLaunchUrl);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not start Wave checkout. Please try again or choose another payment method.'
      );
      setIsProcessing(false);
    }
  };

  const handlePayWithYonnaEasypay = async () => {
    if (!validateParticipantDetails()) {
      return;
    }
    setError('');
    setIsProcessing(true);
    try {
      const res = await api.easypayPartnerCheckout({
        ...donatePayloadBase(),
        channel: 'yonna',
        ...(yonnaPhone.trim() ? { payerPhone: yonnaPhone.trim() } : {})
      });
      if (res.kind !== 'redirect') {
        setError('Unexpected DPay response for Yonna.');
        setIsProcessing(false);
        return;
      }
      setEasypayPendingWalletSession(res.partnerExternalBookingId, {
        launchUrl: res.launchUrl,
        qrPayload: res.qrPayload,
        paymentHtml: res.paymentHtml ?? undefined
      });
      const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');
      window.location.assign(
        `${window.location.origin}${base}/payment/easypay/pending?ref=${encodeURIComponent(res.partnerExternalBookingId)}`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start Yonna checkout.');
      setIsProcessing(false);
    }
  };

  const startEasypayApsOrder = async () => {
    if (!validateParticipantDetails()) {
      return;
    }
    setError('');
    setIsProcessing(true);
    try {
      const res = await api.easypayPartnerCheckout({
        ...donatePayloadBase(),
        channel: 'aps'
      });
      if (res.kind !== 'aps') {
        setError('Unexpected DPay response for APS.');
        setIsProcessing(false);
        return;
      }
      setEasypayApsBookingId(res.partnerExternalBookingId);
      setEasypayApsGatewayCode(res.gatewayCode);
      setApsPhase('auth');
      setIsProcessing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start APS checkout.');
      setIsProcessing(false);
    }
  };

  const handleApsAuthorize = async () => {
    if (!easypayApsBookingId || !apsMobile.trim()) {
      setError('Enter your APS wallet mobile number.');
      return;
    }
    setError('');
    setIsProcessing(true);
    try {
      const res = await api.easypayApsAuthorize({
        partnerExternalBookingId: easypayApsBookingId,
        payerMobile: apsMobile.trim()
      });
      setEasypayApsGatewayCode(res.gatewayCode);
      setApsAuthState(res.authState);
      setApsRequiresOtp(res.requiresOtp);
      setApsPhase(res.requiresOtp ? 'otp' : 'otp');
      setIsProcessing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'APS authorize failed.');
      setIsProcessing(false);
    }
  };

  const handleApsComplete = async () => {
    if (!easypayApsBookingId || !easypayApsGatewayCode || !apsAuthState) {
      setError('Complete the steps above first.');
      return;
    }
    if (apsRequiresOtp && !apsOtp.trim()) {
      setError('Enter the OTP sent to your phone.');
      return;
    }
    setError('');
    setIsProcessing(true);
    try {
      await api.easypayApsComplete({
        partnerExternalBookingId: easypayApsBookingId,
        gatewayCode: easypayApsGatewayCode,
        authState: apsAuthState,
        ...(apsOtp.trim() ? { otp: apsOtp.trim() } : {})
      });
      for (let i = 0; i < 10; i++) {
        const st = await api.getEasypayPaymentStatus(easypayApsBookingId);
        if (st.status === 'succeeded') {
          setStep(3);
          setIsProcessing(false);
          return;
        }
        await new Promise((r) => setTimeout(r, 1200));
      }
      setError(
        'Payment submitted. If your donation does not appear shortly, open the confirmation link from your receipt or contact support.'
      );
      setIsProcessing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'APS payment failed.');
      setIsProcessing(false);
    }
  };

  const handlePayWithBank = async () => {
    if (!validateParticipantDetails()) {
      return;
    }
    if (!selectedBankAccountId) {
      setError('Select a bank account to transfer to.');
      return;
    }
    if (!user && !donorEmail.trim()) {
      setError('Please enter your email so we can notify you when your transfer is confirmed.');
      return;
    }
    if (!user && donorEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(donorEmail.trim())) {
      setError('Please enter a valid email address.');
      return;
    }
    setError('');
    setIsProcessing(true);
    try {
      const res = await api.initiateBankTransfer({
        ...donatePayloadBase(),
        platformBankAccountId: selectedBankAccountId,
        ...(!user && donorEmail.trim() ? { donorEmail: donorEmail.trim() } : {})
      });
      const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');
      window.location.assign(
        `${window.location.origin}${base}/payment/bank/pending?ref=${encodeURIComponent(res.clientReference)}`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start bank transfer.');
      setIsProcessing(false);
    }
  };

  /** Development / fallback: record donation without wallet (when you intentionally keep direct API). */
  const handleSimulateDonation = async () => {
    if (!validateParticipantDetails()) {
      return;
    }

    setError('');
    setIsProcessing(true);

    try {
      await api.createDonation(campaignSlug!, {
        ...(isAnonymous ? { donorName: 'Anonymous' } : donorName.trim() ? { donorName: donorName.trim() } : {}),
        amount: donationAmount,
        ...(platformTipAmount > 0 ? { platformTipAmount } : {}),
        currency: 'GMD',
        message: message || undefined,
        isAnonymous
      });
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process donation');
    } finally {
      setIsProcessing(false);
    }
  };

  const resetAndClose = () => {
    setStep(1);
    setAmount('');
    setPlatformTipAmount(0);
    setDonorName('');
    setMessage('');
    setIsAnonymous(false);
    setPaymentWallet('wave');
    setPaymentProviders(null);
    setEasypayCheckout(false);
    setYonnaPhone('');
    setEasypayApsGatewayCode(null);
    setEasypayApsBookingId(null);
    setApsPhase('idle');
    setApsMobile('');
    setApsAuthState('');
    setApsOtp('');
    setApsRequiresOtp(false);
    setPlatformBankAccounts(null);
    setSelectedBankAccountId('');
    setError('');
    onClose();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-900/60 backdrop-blur-sm">
        <motion.div
          initial={{
            opacity: 0,
            scale: 0.95,
            y: 20
          }}
          animate={{
            opacity: 1,
            scale: 1,
            y: 0
          }}
          exit={{
            opacity: 0,
            scale: 0.95,
            y: 20
          }}
          className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
          
          {/* Header */}
          <div className="flex justify-between items-center p-4 border-b border-surface-100">
            <h2 className="font-display font-bold text-lg text-surface-900">
              {step === 3 ? 'Thank You!' : 'Make a Donation'}
            </h2>
            <button
              type="button"
              aria-label="Close donation modal"
              onClick={resetAndClose}
              className="p-2 text-surface-400 hover:text-surface-600 hover:bg-surface-50 rounded-full transition-colors">
              
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 overflow-y-auto">
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            {step === 1 &&
            <motion.div
              initial={{
                opacity: 0,
                x: -20
              }}
              animate={{
                opacity: 1,
                x: 0
              }}
              className="space-y-6">
              
                <div>
                  <p className="text-sm text-surface-500 mb-4">
                    You are supporting <strong>{campaignTitle}</strong>
                  </p>
                  <label className="block text-sm font-semibold text-surface-700 mb-3">
                    Choose Amount (GMD)
                  </label>
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    {PRESET_AMOUNTS.map((preset) =>
                  <button
                    key={preset}
                    onClick={() => setAmount(preset)}
                    className={`py-3 rounded-xl font-bold border-2 transition-all ${amount === preset ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-surface-200 text-surface-600 hover:border-brand-300'}`}>
                    
                        D{preset}
                      </button>
                  )}
                  </div>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-surface-400 font-bold">
                      D
                    </span>
                    <input
                    type="number"
                    placeholder="Custom Amount"
                    min={1}
                    step="0.01"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value) || '')}
                    className="w-full pl-10 pr-4 py-3 rounded-xl border-2 border-surface-200 focus:border-brand-500 focus:ring-0 outline-none transition-colors font-bold text-surface-900" />
                  
                  </div>
                </div>

                <div className="p-4 rounded-2xl border-2 border-dashed border-brand-200 bg-brand-50/40 space-y-3">
                  <div className="flex items-start gap-2">
                    <SparklesIcon className="w-5 h-5 text-brand-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-surface-900">Support {BRAND_NAME} (optional)</p>
                      <p className="text-xs text-surface-600 mt-0.5">
                        Add a voluntary tip for the platform. It is separate from your campaign gift and helps keep
                        {BRAND_NAME} running.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {PRESET_PLATFORM_TIPS.map((tip) => (
                      <button
                        key={tip}
                        type="button"
                        onClick={() => setPlatformTipAmount(tip)}
                        className={`px-3 py-2 rounded-lg text-sm font-semibold border-2 transition-colors ${
                          platformTipAmount === tip
                            ? 'border-brand-600 bg-white text-brand-800'
                            : 'border-surface-200 text-surface-600 hover:border-brand-300'
                        }`}>
                        {tip === 0 ? 'No tip' : `D${tip}`}
                      </button>
                    ))}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-surface-600 mb-1">Custom tip (GMD)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 font-bold text-sm">
                        D
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={MAX_PLATFORM_TIP}
                        placeholder="0"
                        value={platformTipAmount === 0 ? '' : platformTipAmount}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === '') {
                            setPlatformTipAmount(0);
                            return;
                          }
                          const n = Number.parseInt(v, 10);
                          if (Number.isFinite(n) && n >= 0) {
                            setPlatformTipAmount(Math.min(n, MAX_PLATFORM_TIP));
                          }
                        }}
                        className="w-full pl-9 pr-3 py-2 rounded-lg border-2 border-surface-200 text-sm font-semibold focus:border-brand-500 outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-surface-700 mb-2">
                    {isAnonymous ? 'Anonymous Donation' : 'Your Name'}
                  </label>
                  <input
                    type="text"
                    value={donorName}
                    onChange={(e) => setDonorName(e.target.value)}
                    placeholder={isAnonymous ? 'Anonymous' : user?.fullName || 'Your name'}
                    disabled={isAnonymous}
                    className="w-full p-3 rounded-xl border-2 border-surface-200 focus:border-brand-500 outline-none"
                  />
                  {!isAnonymous && user && (
                    <p className="text-xs text-surface-500 mt-1.5">
                      Signed in as {user.fullName}. Leave the field blank to use your account name on the receipt.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-surface-700 mb-2">
                    Leave a message (optional)
                  </label>
                  <textarea
                  rows={2}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Words of encouragement..."
                  className="w-full p-3 rounded-xl border-2 border-surface-200 focus:border-brand-500 outline-none resize-none">
                </textarea>
                </div>

                <label className="flex items-center gap-3 p-3 border border-surface-200 rounded-xl cursor-pointer hover:bg-surface-50">
                  <input
                  type="checkbox"
                  checked={isAnonymous}
                  onChange={(e) => setIsAnonymous(e.target.checked)}
                  className="w-5 h-5 text-brand-600 rounded border-surface-300 focus:ring-brand-500" />
                
                  <span className="text-sm font-medium text-surface-700">
                    Make my donation anonymous
                  </span>
                </label>

                <button
                disabled={!amount || amount <= 0 || isProcessing}
                onClick={() => setStep(2)}
                className="w-full py-4 bg-brand-600 hover:bg-brand-700 disabled:bg-surface-300 disabled:cursor-not-allowed text-white rounded-xl font-bold text-lg transition-colors flex justify-center items-center gap-2">
                
                  Continue <HeartIcon className="w-5 h-5" />
                </button>
              </motion.div>
            }

            {step === 2 &&
            <motion.div
              initial={{
                opacity: 0,
                x: 20
              }}
              animate={{
                opacity: 1,
                x: 0
              }}
              className="space-y-6">
              
                <p className="text-xs text-surface-500">
                  {easypayCheckout
                    ? 'Payments go through DPay (Wave, Yonna, or APS). Configure return URLs on the DPay side if you want donors to land on your site after paying.'
                    : 'Choose a mobile wallet. APS and Yonna appear here now; your team connects each API on the server when you are ready.'}
                </p>

                <div className="flex flex-wrap gap-2 p-1 bg-surface-100 rounded-xl">
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentWallet('wave');
                      setApsPhase('idle');
                      setEasypayApsBookingId(null);
                      setEasypayApsGatewayCode(null);
                      setApsMobile('');
                      setApsAuthState('');
                      setApsOtp('');
                    }}
                    className={`flex-1 min-w-[5.5rem] py-2 px-2 text-sm font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors ${paymentWallet === 'wave' ? 'bg-white shadow-sm text-surface-900' : 'text-surface-500'}`}>
                    <SmartphoneIcon className="w-4 h-4 shrink-0" /> Wave
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentWallet('aps');
                      setApsPhase('idle');
                      setEasypayApsBookingId(null);
                      setEasypayApsGatewayCode(null);
                      setApsMobile('');
                      setApsAuthState('');
                      setApsOtp('');
                    }}
                    className={`flex-1 min-w-[5.5rem] py-2 px-2 text-sm font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors ${paymentWallet === 'aps' ? 'bg-white shadow-sm text-surface-900' : 'text-surface-500'}`}>
                    <Wallet className="w-4 h-4 shrink-0" /> APS
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentWallet('yonna');
                      setApsPhase('idle');
                      setEasypayApsBookingId(null);
                      setEasypayApsGatewayCode(null);
                      setApsMobile('');
                      setApsAuthState('');
                      setApsOtp('');
                    }}
                    className={`flex-1 min-w-[5.5rem] py-2 px-2 text-sm font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors ${paymentWallet === 'yonna' ? 'bg-white shadow-sm text-surface-900' : 'text-surface-500'}`}>
                    <Landmark className="w-4 h-4 shrink-0" /> Yonna
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentWallet('bank');
                      setApsPhase('idle');
                    }}
                    className={`flex-1 min-w-[5.5rem] py-2 px-2 text-sm font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors ${paymentWallet === 'bank' ? 'bg-white shadow-sm text-surface-900' : 'text-surface-500'}`}>
                    <Building2 className="w-4 h-4 shrink-0" /> Bank
                  </button>
                </div>

                {paymentProviders === null ? (
                  <p className="text-sm text-surface-500 py-2">Loading wallet options…</p>
                ) : paymentWallet === 'bank' ? (
                  <div className="space-y-4">
                    <div className="p-4 bg-surface-50 border border-surface-200 rounded-xl text-sm text-surface-800 space-y-3">
                      <p className="font-semibold text-surface-900">Pay by bank transfer</p>
                      <p>
                        You will get a unique reference and our receiving account details. The campaign total updates
                        only after our team confirms your payment (within 5 days).
                      </p>
                      <ul className="text-sm space-y-1 list-disc list-inside text-surface-700">
                        <li>
                          Declared campaign amount: <strong>D{amount}</strong>
                        </li>
                        {platformTipAmount > 0 ? (
                          <li>
                            Platform tip (on confirm): <strong>D{platformTipAmount}</strong>
                          </li>
                        ) : null}
                      </ul>
                      {platformBankAccounts === null ? (
                        <p className="text-xs text-surface-500">Loading bank accounts…</p>
                      ) : platformBankAccounts.length === 0 ? (
                        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5">
                          Bank donations are not available yet — an admin must add an active receiving account.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          <label className="block text-xs font-semibold text-surface-700">
                            Select bank
                            <select
                              aria-label="Select bank for transfer"
                              value={selectedBankAccountId}
                              onChange={(e) => setSelectedBankAccountId(e.target.value)}
                              className="mt-1 w-full p-2.5 rounded-lg border-2 border-surface-200 text-sm bg-white">
                              <option value="">Select a bank…</option>
                              {platformBankAccounts.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.label ? `${a.label} — ` : ''}
                                  {a.bankName} ({a.accountNumber})
                                </option>
                              ))}
                            </select>
                          </label>
                          {!user ? (
                            <label className="block text-xs font-semibold text-surface-700">
                              Email for status updates
                              <input
                                type="email"
                                value={donorEmail}
                                onChange={(e) => setDonorEmail(e.target.value)}
                                placeholder="you@example.com"
                                required
                                className="mt-1 w-full p-2.5 rounded-lg border-2 border-surface-200 text-sm bg-white"
                              />
                              <span className="mt-1 block text-[11px] font-normal text-surface-500">
                                We will email you when your transfer is confirmed or if there is a problem. Required for
                                guests.
                              </span>
                            </label>
                          ) : (
                            <p className="text-[11px] text-surface-500">
                              Status updates will be sent to <strong>{user.email}</strong>.
                            </p>
                          )}
                          {selectedBankAccountId
                            ? (() => {
                                const selected = platformBankAccounts.find((a) => a.id === selectedBankAccountId);
                                if (!selected) {
                                  return null;
                                }
                                return (
                                  <div className="rounded-lg border border-surface-200 bg-white px-3 py-2 text-xs text-surface-700 space-y-0.5">
                                    <p className="font-semibold text-surface-900">Receiving account</p>
                                    <p>{selected.accountName}</p>
                                    <p>
                                      {selected.bankName} · {selected.accountNumber}
                                    </p>
                                  </div>
                                );
                              })()
                            : null}
                        </div>
                      )}
                    </div>
                  </div>
                ) : paymentWallet === 'wave' ? (
                  <div className="space-y-4">
                    <div className="p-4 bg-brand-50 border border-brand-100 rounded-xl text-sm text-surface-800 space-y-2">
                      <p className="font-semibold text-brand-900">Pay with Wave</p>
                      <ul className="text-sm space-y-1 list-disc list-inside text-surface-700">
                        <li>
                          Campaign: <strong>D{amount}</strong>
                        </li>
                        {platformTipAmount > 0 ? (
                          <li>
                            Platform tip: <strong>D{platformTipAmount}</strong>
                          </li>
                        ) : null}
                        <li>
                          Wave will charge:{' '}
                          <strong>D{chargeTotal}</strong>
                        </li>
                      </ul>
                      <p className="text-xs text-surface-600">
                        {easypayCheckout
                          ? 'After paying, you can open your campaign page to see the donation once DPay confirms (or use the return URL your team configured on DPay).'
                          : (
                            <>
                              When payment succeeds, you&apos;ll return here to confirm. Match{' '}
                              <code className="bg-white/80 px-1 rounded">WAVE_CHECKOUT_CURRENCY</code> to your wallet
                              (e.g. GMD).
                            </>
                          )}
                      </p>
                    </div>
                  </div>
                ) : paymentWallet === 'aps' ? (
                  <div className="space-y-4">
                    <div className="p-4 bg-surface-50 border border-surface-200 rounded-xl text-sm text-surface-800 space-y-2">
                      <p className="font-semibold text-surface-900">Pay with APS Money</p>
                      <p>
                        Total charge:{' '}
                        <strong>D{chargeTotal}</strong>
                        {platformTipAmount > 0 ? (
                          <span className="text-surface-600">
                            {' '}
                            (D{amount} + D{platformTipAmount} tip)
                          </span>
                        ) : null}
                        .
                      </p>
                      {easypayCheckout && paymentProviders?.find((p) => p.id === 'aps')?.checkoutLive ? (
                        apsPhase === 'idle' ? (
                          <p className="text-xs text-surface-600">
                            Tap Pay below to start. You&apos;ll enter your wallet mobile and OTP next.
                          </p>
                        ) : apsPhase === 'auth' ? (
                          <div className="space-y-2 pt-2">
                            <label className="block text-xs font-semibold text-surface-700">APS mobile number</label>
                            <input
                              type="tel"
                              value={apsMobile}
                              onChange={(e) => setApsMobile(e.target.value)}
                              placeholder="e.g. 7XXXXXXX"
                              className="w-full p-2 rounded-lg border-2 border-surface-200 text-sm"
                            />
                            <button
                              type="button"
                              onClick={() => void handleApsAuthorize()}
                              disabled={isProcessing}
                              className="w-full py-2 bg-brand-600 text-white rounded-lg font-semibold text-sm disabled:opacity-60">
                              Send / authorize
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-2 pt-2">
                            {apsRequiresOtp ? (
                              <>
                                <label className="block text-xs font-semibold text-surface-700">OTP</label>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={apsOtp}
                                  onChange={(e) => setApsOtp(e.target.value)}
                                  autoComplete="one-time-code"
                                  aria-label="One-time passcode from APS"
                                  className="w-full p-2 rounded-lg border-2 border-surface-200 text-sm"
                                />
                              </>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => void handleApsComplete()}
                              disabled={isProcessing}
                              className="w-full py-2 bg-brand-600 text-white rounded-lg font-semibold text-sm disabled:opacity-60">
                              Complete payment
                            </button>
                          </div>
                        )
                      ) : paymentProviders?.find((p) => p.id === 'aps')?.checkoutLive ? null : (
                        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5">
                          {paymentProviders?.find((p) => p.id === 'aps')?.configured
                            ? 'Server has APS environment variables — checkout still needs to be wired in the app.'
                            : 'Not active yet: configure DPay partner env vars or add APS_WALLET_* for direct APS.'}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="p-4 bg-surface-50 border border-surface-200 rounded-xl text-sm text-surface-800 space-y-2">
                      <p className="font-semibold text-surface-900">Pay with Yonna</p>
                      <p>
                        Total charge:{' '}
                        <strong>D{chargeTotal}</strong>
                        {platformTipAmount > 0 ? (
                          <span className="text-surface-600">
                            {' '}
                            (D{amount} + D{platformTipAmount} tip)
                          </span>
                        ) : null}
                        .
                      </p>
                      {easypayCheckout && paymentProviders?.find((p) => p.id === 'yonna')?.checkoutLive ? (
                        <div className="space-y-1 pt-1">
                          <label className="block text-xs font-semibold text-surface-700">
                            Mobile (optional, for Yonna)
                          </label>
                          <input
                            type="tel"
                            value={yonnaPhone}
                            onChange={(e) => setYonnaPhone(e.target.value)}
                            placeholder="If DPay requires payer phone"
                            className="w-full p-2 rounded-lg border-2 border-surface-200 text-sm"
                          />
                        </div>
                      ) : null}
                      {paymentProviders?.find((p) => p.id === 'yonna')?.checkoutLive ? null : (
                        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5">
                          {paymentProviders?.find((p) => p.id === 'yonna')?.configured
                            ? 'Server has Yonna environment variables — use DPay to enable Yonna checkout.'
                            : 'Not active yet: configure DPay partner or add YONNA_FOREX_* for a direct integration.'}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                <div className="pt-4 flex flex-col gap-3">
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="px-6 py-4 font-bold text-surface-600 hover:bg-surface-100 rounded-xl transition-colors">
                      Back
                    </button>
                    {(() => {
                      if (paymentWallet === 'bank') {
                        const bankLive =
                          paymentProviders?.find((p) => p.id === 'bank')?.checkoutLive === true &&
                          (platformBankAccounts?.length ?? 0) > 0 &&
                          Boolean(selectedBankAccountId);
                        return (
                          <button
                            type="button"
                            onClick={() => void handlePayWithBank()}
                            disabled={isProcessing || !bankLive}
                            className="flex-1 py-4 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold text-lg transition-colors flex justify-center items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed">
                            {isProcessing ? (
                              <span className="animate-pulse">Preparing instructions…</span>
                            ) : (
                              <>Get bank transfer instructions</>
                            )}
                          </button>
                        );
                      }

                      const waveP = paymentProviders?.find((p) => p.id === 'wave');
                      const waveLive = waveP?.checkoutLive === true;
                      if (paymentWallet === 'wave') {
                        return (
                          <button
                            type="button"
                            onClick={() => void handlePayWithWave()}
                            disabled={isProcessing || !waveLive}
                            className="flex-1 py-4 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold text-lg transition-colors flex justify-center items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed">
                            {isProcessing ? (
                              <span className="animate-pulse">Opening Wave…</span>
                            ) : (
                              <>
                                Pay D{chargeTotal} with Wave
                                {platformTipAmount > 0 ? (
                                  <span className="text-sm font-normal opacity-90">
                                    {' '}
                                    (D{amount} + D{platformTipAmount} tip)
                                  </span>
                                ) : null}
                              </>
                            )}
                          </button>
                        );
                      }

                      if (paymentWallet === 'yonna') {
                        const yonnaLive = paymentProviders?.find((p) => p.id === 'yonna')?.checkoutLive === true;
                        return (
                          <button
                            type="button"
                            onClick={() => void handlePayWithYonnaEasypay()}
                            disabled={isProcessing || !yonnaLive}
                            className="flex-1 py-4 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold text-lg transition-colors flex justify-center items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed">
                            {isProcessing ? (
                              <span className="animate-pulse">Opening Yonna…</span>
                            ) : (
                              <>
                                Pay D{chargeTotal} with Yonna
                                {platformTipAmount > 0 ? (
                                  <span className="text-sm font-normal opacity-90">
                                    {' '}
                                    (D{amount} + D{platformTipAmount} tip)
                                  </span>
                                ) : null}
                              </>
                            )}
                          </button>
                        );
                      }

                      const apsLive = paymentProviders?.find((p) => p.id === 'aps')?.checkoutLive === true;
                      if (!apsLive) {
                        return (
                          <button
                            type="button"
                            disabled
                            className="flex-1 py-4 bg-surface-200 text-surface-600 rounded-xl font-bold text-lg cursor-not-allowed">
                            APS checkout soon
                          </button>
                        );
                      }

                      if (apsPhase === 'idle') {
                        return (
                          <button
                            type="button"
                            onClick={() => void startEasypayApsOrder()}
                            disabled={isProcessing}
                            className="flex-1 py-4 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold text-lg transition-colors flex justify-center items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed">
                            {isProcessing ? (
                              <span className="animate-pulse">Starting…</span>
                            ) : (
                              <>
                                Pay D{chargeTotal} with APS
                                {platformTipAmount > 0 ? (
                                  <span className="text-sm font-normal opacity-90">
                                    {' '}
                                    (D{amount} + D{platformTipAmount} tip)
                                  </span>
                                ) : null}
                              </>
                            )}
                          </button>
                        );
                      }

                      return (
                        <button
                          type="button"
                          disabled
                          className="flex-1 py-4 bg-surface-100 text-surface-600 rounded-xl font-bold text-base cursor-not-allowed">
                          Continue in the APS fields above
                        </button>
                      );
                    })()}
                  </div>
                  {import.meta.env.DEV && paymentWallet === 'wave' && (
                    <button
                      type="button"
                      onClick={() => void handleSimulateDonation()}
                      disabled={isProcessing}
                      className="w-full py-2 text-xs font-semibold text-surface-500 hover:text-surface-700 underline">
                      Dev only: skip Wave and record donation locally
                    </button>
                  )}
                </div>
              </motion.div>
            }

            {step === 3 &&
            <motion.div
              initial={{
                opacity: 0,
                scale: 0.9
              }}
              animate={{
                opacity: 1,
                scale: 1
              }}
              className="text-center py-8">
              
                <div className="w-20 h-20 bg-brand-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <CheckCircleIcon className="w-10 h-10 text-brand-600" />
                </div>
                <h3 className="font-display font-bold text-2xl text-surface-900 mb-2">
                  Donation Successful!
                </h3>
                <p className="text-surface-500 mb-8">
                  Thank you for your generous donation of <strong>D{amount}</strong> to {campaignTitle}.
                  {platformTipAmount > 0 ? (
                    <>
                      {' '}
                      You also added <strong>D{platformTipAmount}</strong> to support {BRAND_NAME} — thank you!
                    </>
                  ) : null}{' '}
                  Your support makes a real difference.
                </p>
                <button
                onClick={resetAndClose}
                className="w-full py-4 bg-surface-100 hover:bg-surface-200 text-surface-900 rounded-xl font-bold transition-colors">
                
                  Close
                </button>
              </motion.div>
            }
          </div>
        </motion.div>
      </div>
    </AnimatePresence>);

}
