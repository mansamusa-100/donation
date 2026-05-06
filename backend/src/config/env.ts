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
  INTERNAL_PARTNER_WEBHOOK_SECRET: z.string().default(''),
  /** Business created in Easypay dashboard (single platform merchant) */
  EASYPAY_PARTNER_BUSINESS_ID: z.string().default('')
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('Invalid server environment variables:', parsedEnv.error.flatten().fieldErrors);
  throw new Error('Server environment validation failed');
}

export const env = parsedEnv.data;
