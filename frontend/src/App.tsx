import { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { Footer } from './components/Footer';
import { Navbar } from './components/Navbar';
import { EmailVerificationBanner } from './components/EmailVerificationBanner';
import { RouteLoader } from './components/RouteLoader';
import { HomePage } from './pages/HomePage';

const ExplorePage = lazy(async () => ({
  default: (await import('./pages/ExplorePage')).ExplorePage
}));

const CampaignDetailPage = lazy(async () => ({
  default: (await import('./pages/CampaignDetailPage')).CampaignDetailPage
}));

const CreateCampaignPage = lazy(async () => ({
  default: (await import('./pages/CreateCampaignPage')).CreateCampaignPage
}));

const LoginPage = lazy(async () => ({
  default: (await import('./pages/LoginPage')).LoginPage
}));

const RegisterPage = lazy(async () => ({
  default: (await import('./pages/RegisterPage')).RegisterPage
}));

const ForgotPasswordPage = lazy(async () => ({
  default: (await import('./pages/ForgotPasswordPage')).ForgotPasswordPage
}));

const ResetPasswordPage = lazy(async () => ({
  default: (await import('./pages/ResetPasswordPage')).ResetPasswordPage
}));

const VerifyEmailPage = lazy(async () => ({
  default: (await import('./pages/VerifyEmailPage')).VerifyEmailPage
}));

const DashboardPage = lazy(async () => ({
  default: (await import('./pages/DashboardPage')).DashboardPage
}));

const AdminPage = lazy(async () => ({
  default: (await import('./pages/AdminPage')).AdminPage
}));

const PaymentWaveReturnPage = lazy(async () => ({
  default: (await import('./pages/PaymentWaveReturnPage')).PaymentWaveReturnPage
}));

const PaymentBankPendingPage = lazy(async () => ({
  default: (await import('./pages/PaymentBankPendingPage')).PaymentBankPendingPage
}));

const TrackBankTransferPage = lazy(async () => ({
  default: (await import('./pages/TrackBankTransferPage')).TrackBankTransferPage
}));

const PaymentEasypayReturnPage = lazy(async () => ({
  default: (await import('./pages/PaymentEasypayReturnPage')).PaymentEasypayReturnPage
}));

const PaymentEasypayPendingPage = lazy(async () => ({
  default: (await import('./pages/PaymentEasypayPendingPage')).PaymentEasypayPendingPage
}));

const PricingFeesPage = lazy(async () => ({
  default: (await import('./pages/PricingFeesPage')).PricingFeesPage
}));

const AboutPage = lazy(async () => ({
  default: (await import('./pages/AboutPage')).AboutPage
}));

const HelpCenterPage = lazy(async () => ({
  default: (await import('./pages/HelpCenterPage')).HelpCenterPage
}));

const TrustSafetyPage = lazy(async () => ({
  default: (await import('./pages/TrustSafetyPage')).TrustSafetyPage
}));

const ContactPage = lazy(async () => ({
  default: (await import('./pages/ContactPage')).ContactPage
}));

const TermsOfServicePage = lazy(async () => ({
  default: (await import('./pages/TermsOfServicePage')).TermsOfServicePage
}));

const PrivacyPolicyPage = lazy(async () => ({
  default: (await import('./pages/PrivacyPolicyPage')).PrivacyPolicyPage
}));

function ScrollManager() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) {
      const target = document.querySelector(hash);

      if (target instanceof HTMLElement) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }

    window.scrollTo(0, 0);
  }, [pathname, hash]);

  return null;
}

function AppChrome() {
  const { pathname } = useLocation();
  const isAdminShell = pathname.startsWith('/admin');

  return (
    <div
      className={
        isAdminShell
          ? 'min-h-screen font-body text-surface-900 bg-slate-100'
          : 'flex flex-col min-h-screen font-body text-surface-900 bg-surface-50'
      }>
      {!isAdminShell && <Navbar />}
      {!isAdminShell && <EmailVerificationBanner />}
      <main className={isAdminShell ? 'min-h-screen' : 'flex-grow'}>
        <Suspense fallback={<RouteLoader />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/explore" element={<ExplorePage />} />
            <Route path="/campaign/:slug" element={<CampaignDetailPage />} />
            <Route path="/create" element={<CreateCampaignPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/payment/wave/return" element={<PaymentWaveReturnPage />} />
            <Route path="/payment/easypay/pending" element={<PaymentEasypayPendingPage />} />
            <Route path="/payment/bank/pending" element={<PaymentBankPendingPage />} />
            <Route path="/track-bank-transfer" element={<TrackBankTransferPage />} />
            <Route path="/payment/easypay/return" element={<PaymentEasypayReturnPage />} />
            <Route path="/pricing" element={<PricingFeesPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/help" element={<HelpCenterPage />} />
            <Route path="/trust" element={<TrustSafetyPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/terms" element={<TermsOfServicePage />} />
            <Route path="/privacy" element={<PrivacyPolicyPage />} />
          </Routes>
        </Suspense>
      </main>
      {!isAdminShell && <Footer />}
    </div>
  );
}

function AppInner() {
  return (
    <BrowserRouter>
      <ScrollManager />
      <AppChrome />
    </BrowserRouter>
  );
}

export function App() {
  return <AppInner />;
}
