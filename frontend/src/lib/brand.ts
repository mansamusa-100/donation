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
