import { PhoneIcon, MessageCircleIcon, MailIcon } from 'lucide-react';
import { SiteArticleLayout } from '../components/SiteArticleLayout';
import {
  BRAND_NAME,
  PUBLIC_SUPPORT_EMAIL,
  SUPPORT_PHONES,
  SUPPORT_WHATSAPP,
  telHref,
  whatsappHref
} from '../lib/brand';

export function ContactPage() {
  const mailHref = `mailto:${PUBLIC_SUPPORT_EMAIL}?subject=${encodeURIComponent(`${BRAND_NAME} support`)}`;
  const waPrefill = `Hello ${BRAND_NAME}, I have a question about…`;

  return (
    <SiteArticleLayout
      title="Contact us"
      subtitle="Call, WhatsApp, or email — we are happy to help with account, donation, and campaign questions."
    >
      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold text-surface-900">Phone</h2>
        <p className="text-sm text-surface-600">
          Reach our team during business hours for platform or payment inquiries.
        </p>
        <ul className="space-y-3">
          {SUPPORT_PHONES.map((phone) => (
            <li key={phone}>
              <a
                href={telHref(phone)}
                className="inline-flex items-center gap-3 rounded-xl border border-surface-200 bg-white px-4 py-3 font-semibold text-surface-900 hover:border-brand-300 hover:bg-brand-50/50 transition-colors"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                  <PhoneIcon className="h-5 w-5" />
                </span>
                {phone}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold text-surface-900">WhatsApp</h2>
        <p className="text-sm text-surface-600">Prefer chat? Message us on WhatsApp.</p>
        <a
          href={whatsappHref(SUPPORT_WHATSAPP, waPrefill)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-3 rounded-xl border border-[#25D366]/30 bg-[#25D366]/10 px-4 py-3 font-semibold text-surface-900 hover:bg-[#25D366]/20 transition-colors"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#25D366] text-white">
            <MessageCircleIcon className="h-5 w-5" />
          </span>
          WhatsApp {SUPPORT_WHATSAPP}
        </a>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-bold text-surface-900">Email</h2>
        <p>
          <a
            href={mailHref}
            className="inline-flex items-center gap-2 font-semibold text-brand-600 hover:text-brand-700 break-all"
          >
            <MailIcon className="h-4 w-4 shrink-0" />
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
