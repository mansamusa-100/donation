/** Visible platform name — use for headings, footer, emails (match marketing). */
export const BRAND_NAME = 'BarakahFund';

/** Optional split styling: Barakah + Fund */
export const BRAND_NAME_PRIMARY = 'Barakah';

/**
 * Canonical brand mark: the app icon (`public/log.svg` — teal rounded square + star).
 * Use this everywhere for uniqueness (nav, PWA, social profile).
 */
export const BRAND_LOGO_SRC = `${import.meta.env.BASE_URL}log.svg`;

/** Raster twin of the app icon for places that need PNG (emails, some social uploads). */
export const BRAND_LOGO_PNG_SRC = `${import.meta.env.BASE_URL}log.png`;

/** Public support inbox (Contact page, mailto links). Set `VITE_SUPPORT_EMAIL` in `.env` to override. */
export const PUBLIC_SUPPORT_EMAIL =
  (import.meta.env.VITE_SUPPORT_EMAIL as string | undefined)?.trim() || 'support@contact.barakahfund.site';

/** Platform support phone lines (Gambia). Override with comma-separated `VITE_SUPPORT_PHONES`. */
function parseSupportPhones(): string[] {
  const fromEnv = (import.meta.env.VITE_SUPPORT_PHONES as string | undefined)?.trim();
  if (fromEnv) {
    return fromEnv
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
  }
  return ['+220 4512233', '+220 6612610'];
}

export const SUPPORT_PHONES = parseSupportPhones();

/** WhatsApp support number (display form). Override with `VITE_SUPPORT_WHATSAPP`. */
export const SUPPORT_WHATSAPP =
  (import.meta.env.VITE_SUPPORT_WHATSAPP as string | undefined)?.trim() || '+220 6612610';

/** Digits-only for `tel:` / `wa.me` links. */
export function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function telHref(phone: string): string {
  const digits = phoneDigits(phone);
  return digits ? `tel:+${digits}` : 'tel:';
}

export function whatsappHref(phone: string, prefill?: string): string {
  const digits = phoneDigits(phone);
  const base = `https://wa.me/${digits}`;
  if (!prefill?.trim()) {
    return base;
  }
  return `${base}?text=${encodeURIComponent(prefill.trim())}`;
}
