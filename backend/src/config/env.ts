import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  CLIENT_ORIGIN: z.string().default('https://app.barakahfund.site'),
  JWT_SECRET: z.string().default('your-secret-key-change-in-production'),
  /** Resend API (https://resend.com) — preferred when set. */
  RESEND_API_KEY: z.string().default(''),
  /** Must be a verified sender domain in Resend (e.g. BarakahFund <noreply@yourdomain.com>). */
  RESEND_FROM: z.string().default(''),
  /** When set (e.g. Mailpit, Mailhog, or real SMTP), outbound email is sent if Resend is not configured. */
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  MAIL_FROM: z.string().default('BarakahFund <noreply@barakahfund.local>'),
  /** Wave Business Checkout — create key at https://business.wave.com/dev-portal */
  WAVE_API_KEY: z.string().default(''),
  WAVE_API_BASE_URL: z.string().url().default('https://api.wave.com'),
  /** Optional HMAC signing secret if enabled on the API key */
  WAVE_SIGNING_SECRET: z.string().default(''),
  /** ISO 4217 code for checkout (e.g. GMD for Gambia, XOF for Senegal) — must match your Wave wallet */
  WAVE_CHECKOUT_CURRENCY: z.string().default('GMD'),
  /** Webhook secret from Wave Business portal (HMAC Wave-Signature; not the API WAVE_SIGNING_SECRET). */
  WAVE_WEBHOOK_SECRET: z.string().default(''),
  /** If the portal uses Bearer auth instead of HMAC, set the same token here (can be combined with WAVE_WEBHOOK_SECRET). */
  WAVE_WEBHOOK_BEARER: z.string().default(''),
  /** Optional. Public API base (no trailing slash) for webhooks / return URLs in production. */
  APP_PUBLIC_BASE_URL: z.string().default(''),
  /** Yonna Forex corporate API — fill when wiring donations via Yonna. */
  YONNA_FOREX_API_URL: z.string().default(''),
  YONNA_FOREX_SECRET_KEY: z.string().default(''),
  YONNA_FOREX_CLIENT_ID: z.string().default(''),
  YONNA_FOREX_COUNTRY_CODE: z.string().default('+220'),
  /** APS Money Wallet API — fill when wiring donations via APS. */
  APS_WALLET_BASE_URL: z.string().default(''),
  APS_WALLET_MOBILE: z.string().default(''),
  APS_WALLET_PASSWORD: z.string().default(''),
  APS_WALLET_ACCESS_CHANNEL: z.string().default(''),
  /** Easypay internal partner API — dashboard business + partner credentials */
  EASYPAY_API_BASE_URL: z.string().default(''),
  INTERNAL_PARTNER_API_SECRET: z.string().default(''),
  /** Use `raw` if Easypay expects the secret as the full Authorization value (no `Bearer `). Default: bearer. */
  INTERNAL_PARTNER_AUTH_MODE: z.enum(['bearer', 'raw']).default('bearer'),
  INTERNAL_PARTNER_WEBHOOK_SECRET: z.string().default(''),
  /** Business created in Easypay dashboard (single platform merchant) */
  EASYPAY_PARTNER_BUSINESS_ID: z.string().default(''),
  /** OAuth client ID from Google Auth Platform — enables "Continue with Google". */
  GOOGLE_CLIENT_ID: z.string().default(''),
  /** Optional parent domain for the session cookie (e.g. `.barakahfund.site` for app + API subdomains). */
  AUTH_COOKIE_DOMAIN: z.string().default(''),
  /** Session cookie SameSite. Use `none` only with HTTPS if frontend and API are on different sites. */
  AUTH_COOKIE_SAME_SITE: z.enum(['lax', 'none', 'strict']).default('lax'),
  /**
   * Absolute directory for uploaded files (avatars, covers, verification IDs).
   * In production with a volume, set e.g. `/app/uploads`. Default: `<cwd>/uploads`.
   */
  UPLOADS_DIR: z.string().default(''),
  /**
   * Platform owner (primary admin). Required in production.
   * On startup the API creates this ADMIN if missing. Password is only reset when OWNER_PASSWORD_SYNC=true.
   */
  OWNER_EMAIL: z.string().default(''),
  OWNER_PASSWORD: z.string().default(''),
  OWNER_FULL_NAME: z.string().default('Platform Owner'),
  /** When true, startup updates the owner account password from OWNER_PASSWORD (recovery / rotate). */
  OWNER_PASSWORD_SYNC: z
    .string()
    .default('false')
    .transform((v) => ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase()))
});

const INSECURE_JWT_SECRETS = new Set([
  'your-secret-key-change-in-production',
  'change-me-in-production'
]);

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('Invalid server environment variables:', parsedEnv.error.flatten().fieldErrors);
  throw new Error('Server environment validation failed');
}

const env = parsedEnv.data;

if (env.NODE_ENV === 'production') {
  const secret = env.JWT_SECRET.trim();
  if (!secret || secret.length < 32 || INSECURE_JWT_SECRETS.has(secret)) {
    throw new Error(
      'JWT_SECRET must be a strong random value (at least 32 characters) in production. Generate one with: openssl rand -base64 48'
    );
  }

  const ownerEmail = env.OWNER_EMAIL.trim();
  const ownerPassword = env.OWNER_PASSWORD;
  if (!ownerEmail || !ownerPassword) {
    throw new Error(
      'OWNER_EMAIL and OWNER_PASSWORD are required in production (platform owner / primary admin credentials).'
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
    throw new Error('OWNER_EMAIL must be a valid email address');
  }
  if (ownerPassword.length < 8) {
    throw new Error('OWNER_PASSWORD must be at least 8 characters');
  }
}

export { env };
