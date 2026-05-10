/** Visible platform name — use for headings, footer, emails (match marketing). */
export const BRAND_NAME = 'BarakahFund';

/** Optional split styling: Barakah + Fund */
export const BRAND_NAME_PRIMARY = 'Barakah';

/** Resolved path under `public/` (respects Vite `base`). */
export const BRAND_LOGO_SRC = `${import.meta.env.BASE_URL}log.svg`;

/** Public support inbox (Contact page, mailto links). Set `VITE_SUPPORT_EMAIL` in `.env` to override. */
export const PUBLIC_SUPPORT_EMAIL =
  (import.meta.env.VITE_SUPPORT_EMAIL as string | undefined)?.trim() || 'support@contact.barakahfund.site';
