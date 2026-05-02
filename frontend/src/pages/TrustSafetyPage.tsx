import { Link } from 'react-router-dom';
import { SiteArticleLayout } from '../components/SiteArticleLayout';
import { BRAND_NAME } from '../lib/brand';

export function TrustSafetyPage() {
  return (
    <SiteArticleLayout
      title="Trust & safety"
      subtitle={`How ${BRAND_NAME} approaches verification, moderation, and protecting the community.`}>
      <section className="space-y-3">
        <h2 className="font-display text-xl font-bold text-surface-900">Campaign review</h2>
        <p>
          New campaigns are reviewed by administrators before they are activated for the public site. Organizers may be
          asked to provide identification or supporting documentation. Approval, rejection, or closure decisions are
          part of keeping the directory credible.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-bold text-surface-900">Donor expectations</h2>
        <p>
          Crowdfunding carries inherent risk: not every campaign will reach its goal, and use of funds depends on the
          organizer. We encourage donors to read campaign stories carefully, check available verification signals, and
          give only what they are comfortable with.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-bold text-surface-900">Accounts & fraud</h2>
        <p>
          Suspicious activity, impersonation, or misuse of the platform should be reported promptly. Administrators can
          deactivate accounts and take campaigns offline when policies are violated.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-bold text-surface-900">Operational integrity</h2>
        <p>
          Key administrative actions (such as campaign decisions, withdrawal updates, and account changes) are logged
          for accountability within the team. This helps resolve disputes and maintain an audit trail.
        </p>
      </section>

      <p className="text-sm text-surface-600 pt-2">
        Concerns or reports:{' '}
        <Link to="/contact" className="font-semibold text-brand-600 hover:text-brand-700">
          Contact us
        </Link>
        .
      </p>
    </SiteArticleLayout>
  );
}
