import { SiteArticleLayout } from '../components/SiteArticleLayout';
import { BRAND_NAME, PUBLIC_SUPPORT_EMAIL } from '../lib/brand';

export function ContactPage() {
  const mailHref = `mailto:${PUBLIC_SUPPORT_EMAIL}?subject=${encodeURIComponent(`${BRAND_NAME} support`)}`;

  return (
    <SiteArticleLayout
      title="Contact us"
      subtitle="We read every message and will get back to you as soon as we can.">
      <section className="space-y-3">
        <h2 className="font-display text-xl font-bold text-surface-900">Email</h2>
        <p>
          <a href={mailHref} className="font-semibold text-brand-600 hover:text-brand-700 break-all">
            {PUBLIC_SUPPORT_EMAIL}
          </a>
        </p>
        <p className="text-sm text-surface-600">
          Include your account email, campaign link (if relevant), and a short description of the issue. Screenshots
          help for payment or technical problems.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-bold text-surface-900">Response times</h2>
        <p>
          Typical replies within a few business days. Urgent fraud or safety issues—please mark the subject line
          clearly so we can prioritize.
        </p>
      </section>
    </SiteArticleLayout>
  );
}
