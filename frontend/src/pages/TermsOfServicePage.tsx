import { Link } from 'react-router-dom';
import { SiteArticleLayout } from '../components/SiteArticleLayout';
import { BRAND_NAME } from '../lib/brand';

export function TermsOfServicePage() {
  return (
    <SiteArticleLayout
      title="Terms of service"
      subtitle={`Please read these terms carefully before using ${BRAND_NAME}. By accessing or using the platform, you agree to be bound by them.`}>
      <p className="text-sm text-surface-600">
        Last updated: {new Date().getFullYear()}. These terms are a general template for your product—have them
        reviewed by qualified legal counsel before relying on them in production.
      </p>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-bold text-surface-900">1. The service</h2>
        <p>
          {BRAND_NAME} provides an online crowdfunding platform that allows organizers to publish campaigns and
          accept support from donors. We facilitate technology and may provide related tools (accounts, dashboards,
          payment connections as configured). We are not a bank, money transmitter, or charity.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-bold text-surface-900">2. Accounts</h2>
        <p>
          You must provide accurate information and keep your login secure. You are responsible for activity under
          your account. We may suspend or close accounts that violate these terms, create risk, or misuse the service.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-bold text-surface-900">3. Campaigns & content</h2>
        <p>
          Organizers are responsible for the truthfulness of campaign materials and for complying with applicable laws.
          Campaigns may be reviewed, approved, rejected, or removed at our discretion. Donations and tips are
          voluntary; outcomes are not guaranteed.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-bold text-surface-900">4. Fees & payments</h2>
        <p>
          Platform and processing fees may apply as described on our{' '}
          <Link to="/pricing" className="font-semibold text-brand-600 hover:text-brand-700">
            Pricing & fees
          </Link>{' '}
          page. Payment methods and settlement timelines depend on third-party providers.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-bold text-surface-900">5. Prohibited conduct</h2>
        <p>
          You may not use {BRAND_NAME} for illegal activity, fraud, harassment, impersonation, malware, or to
          circumvent our policies. We may investigate abuse and cooperate with authorities where required.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-bold text-surface-900">6. Disclaimers & limitation of liability</h2>
        <p>
          The service is provided &quot;as is&quot; to the fullest extent permitted by law. We disclaim warranties
          where allowed. Our total liability for claims arising from the service may be limited as permitted by
          applicable law.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-bold text-surface-900">7. Changes</h2>
        <p>
          We may update these terms from time to time. Continued use after changes constitutes acceptance of the revised
          terms, where permitted by law.
        </p>
      </section>

      <p className="text-sm text-surface-600 pt-2">
        Questions:{' '}
        <Link to="/contact" className="font-semibold text-brand-600 hover:text-brand-700">
          Contact us
        </Link>
        . Related:{' '}
        <Link to="/privacy" className="font-semibold text-brand-600 hover:text-brand-700">
          Privacy policy
        </Link>
        .
      </p>
    </SiteArticleLayout>
  );
}
