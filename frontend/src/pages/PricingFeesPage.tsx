import { Link } from 'react-router-dom';
import { SiteArticleLayout } from '../components/SiteArticleLayout';
import { BRAND_NAME } from '../lib/brand';

export function PricingFeesPage() {
  return (
    <SiteArticleLayout
      title="Pricing & fees"
      subtitle={`How ${BRAND_NAME} covers operations while keeping fundraising transparent for organizers and donors.`}>
      <section className="space-y-3">
        <h2 className="font-display text-xl font-bold text-surface-900">Donations</h2>
        <p>
          A <strong className="text-surface-900">1.9%</strong> platform fee applies to each recorded donation. This
          supports payment processing, fraud prevention, hosting, and ongoing product improvements. The fee is handled
          on the platform side so campaign totals and donor receipts stay clear.
        </p>
        <p>
          Donors may optionally add a <strong className="text-surface-900">voluntary tip</strong> at checkout to
          support the platform, tips are separate from the amount raised for the campaign.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-bold text-surface-900">Withdrawals</h2>
        <p>
          When you request a payout from an eligible campaign balance, a{' '}
          <strong className="text-surface-900">3%</strong> processing fee applies to the requested withdrawal amount.
          The net amount is what is intended for disbursement after that fee.
        </p>
        <p className="text-sm text-surface-600">
          Exact figures for your campaigns appear in your dashboard when you create withdrawal requests.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-bold text-surface-900">Listing & accounts</h2>
        <p>
          There is no separate charge to create an organizer account or to submit a campaign for review. Standard
          fees apply only as donations are recorded and when payouts are processed, as described above.
        </p>
      </section>

      <p className="text-sm text-surface-600 pt-2">
        Questions? See the{' '}
        <Link to="/help" className="font-semibold text-brand-600 hover:text-brand-700">
          Help Center
        </Link>{' '}
        or{' '}
        <Link to="/contact" className="font-semibold text-brand-600 hover:text-brand-700">
          contact us
        </Link>
        .
      </p>
    </SiteArticleLayout>
  );
}
