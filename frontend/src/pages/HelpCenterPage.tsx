import { Link } from 'react-router-dom';
import { SiteArticleLayout } from '../components/SiteArticleLayout';
import { BRAND_NAME } from '../lib/brand';

export function HelpCenterPage() {
  return (
    <SiteArticleLayout
      title="Help Center"
      subtitle={`Quick answers for organizers and donors using ${BRAND_NAME}.`}>
      <section className="space-y-3">
        <h2 className="font-display text-xl font-bold text-surface-900">Getting started</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <Link to="/register" className="font-semibold text-brand-600 hover:text-brand-700">
              Create an account
            </Link>{' '}
            to launch or support campaigns.
          </li>
          <li>
            Browse live fundraisers on{' '}
            <Link to="/explore" className="font-semibold text-brand-600 hover:text-brand-700">
              Explore
            </Link>
            .
          </li>
          <li>
            Organizers can open the{' '}
            <Link to="/dashboard" className="font-semibold text-brand-600 hover:text-brand-700">
              Dashboard
            </Link>{' '}
            to track campaigns, donations, and withdrawals.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-bold text-surface-900">Creating a campaign</h2>
        <p>
          Use{' '}
          <Link to="/create" className="font-semibold text-brand-600 hover:text-brand-700">
            Start a campaign
          </Link>{' '}
          to add your story, goal, and verification documents. Submissions go through an admin review before they can go
          live on the public site.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-bold text-surface-900">Donations & receipts</h2>
        <p>
          Donors complete checkout through the platform&apos;s configured payment flow. Platform and tip lines, where
          applicable, are shown before you confirm. If a payment fails, try again or use a different method if
          available.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-bold text-surface-900">Withdrawals</h2>
        <p>
          Eligible campaign balances can be withdrawn from the dashboard. Withdrawal processing fees and net amounts
          are summarized when you submit a request. Status updates (pending, approved, paid, etc.) are visible on your
          withdrawal history.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-bold text-surface-900">Still stuck?</h2>
        <p>
          Read{' '}
          <Link to="/pricing" className="font-semibold text-brand-600 hover:text-brand-700">
            Pricing & fees
          </Link>
          , review{' '}
          <Link to="/trust" className="font-semibold text-brand-600 hover:text-brand-700">
            Trust & safety
          </Link>
          , or{' '}
          <Link to="/contact" className="font-semibold text-brand-600 hover:text-brand-700">
            contact the team
          </Link>
          .
        </p>
      </section>
    </SiteArticleLayout>
  );
}
