import { Link } from 'react-router-dom';
import { SiteArticleLayout } from '../components/SiteArticleLayout';
import { BRAND_NAME } from '../lib/brand';

export function PrivacyPolicyPage() {
  return (
    <SiteArticleLayout
      title="Privacy policy"
      subtitle={`How ${BRAND_NAME} collects, uses, and protects information when you use our website and services.`}>
      <p className="text-sm text-surface-600">
        Last updated: {new Date().getFullYear()}. This policy is a general outline for your product—have it reviewed by
        qualified legal counsel and align it with your actual data practices and jurisdiction.
      </p>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-bold text-surface-900">1. Information we collect</h2>
        <p>We may collect:</p>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong className="text-surface-900">Account data</strong> — such as name, email, and phone when you
            register or verify your identity.
          </li>
          <li>
            <strong className="text-surface-900">Campaign & donation data</strong> — content you submit, amounts,
            messages, and records needed to operate fundraising and payouts.
          </li>
          <li>
            <strong className="text-surface-900">Technical data</strong> — such as IP address, device or browser
            signals, and cookies or similar technologies where used.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-bold text-surface-900">2. How we use information</h2>
        <p>We use information to provide and improve the service, process donations and withdrawals, verify campaigns,
          communicate with you, secure the platform, comply with law, and analyze usage in aggregated form.</p>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-bold text-surface-900">3. Sharing</h2>
        <p>
          We may share data with payment and infrastructure providers who assist in operating {BRAND_NAME}, subject to
          contractual safeguards where appropriate. We may disclose information if required by law or to protect
          rights, safety, and integrity of users and the public.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-bold text-surface-900">4. Retention</h2>
        <p>
          We retain information as long as needed for the purposes above, including legal, tax, and operational
          requirements, then delete or anonymize it where practicable.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-bold text-surface-900">5. Security</h2>
        <p>
          We use reasonable technical and organizational measures to protect personal data. No method of transmission or
          storage is completely secure.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-bold text-surface-900">6. Your choices</h2>
        <p>
          Depending on your location, you may have rights to access, correct, delete, or object to certain processing.
          Contact us to exercise applicable rights; we may need to verify your request.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-bold text-surface-900">7. Children</h2>
        <p>
          {BRAND_NAME} is not directed at children under the age where parental consent is required for data collection
          in your jurisdiction. We do not knowingly collect such data.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-bold text-surface-900">8. International transfers</h2>
        <p>
          If you access the service from outside the country where we operate servers, your information may be processed
          in jurisdictions with different data protection laws.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-bold text-surface-900">9. Updates</h2>
        <p>We may revise this policy from time to time. The updated date will be reflected on this page.</p>
      </section>

      <p className="text-sm text-surface-600 pt-2">
        Questions:{' '}
        <Link to="/contact" className="font-semibold text-brand-600 hover:text-brand-700">
          Contact us
        </Link>
        . Related:{' '}
        <Link to="/terms" className="font-semibold text-brand-600 hover:text-brand-700">
          Terms of service
        </Link>
        ,{' '}
        <Link to="/trust" className="font-semibold text-brand-600 hover:text-brand-700">
          Trust & safety
        </Link>
        .
      </p>
    </SiteArticleLayout>
  );
}
