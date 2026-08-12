import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import type { RequestHandler } from 'express';
import { env } from '../config/env.js';

/** Behind nginx, Cloudflare, etc. — required for correct client IP and secure cookies. */
export function configureTrustProxy(app: { set: (key: string, value: number) => void }): void {
  if (env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }
}

function cspConnectSources(): string[] {
  const sources = new Set<string>(["'self'", 'https://accounts.google.com', 'https://oauth2.googleapis.com']);

  try {
    sources.add(new URL(env.CLIENT_ORIGIN).origin);
  } catch {
    // ignore invalid CLIENT_ORIGIN
  }

  const apiBase = env.APP_PUBLIC_BASE_URL.trim();
  if (apiBase) {
    try {
      sources.add(new URL(apiBase).origin);
    } catch {
      // ignore
    }
  }

  return [...sources];
}

export const helmetMiddleware: RequestHandler = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'", 'https://accounts.google.com', 'https://apis.google.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      connectSrc: cspConnectSources(),
      frameSrc: ["'self'", 'https:'],
      frameAncestors: ["'self'"],
      ...(env.NODE_ENV === 'production' ? { upgradeInsecureRequests: [] } : {})
    }
  },
  // GIS Sign in with Google uses a popup that posts the ID token back to the opener.
  // Helmet's default COOP "same-origin" isolates the opener and leaves a blank popup.
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  crossOriginResourcePolicy: { policy: 'cross-origin' }
});

export const generalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.NODE_ENV === 'production' ? 300 : 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please try again later.' }
});

/** Stricter limits on credential and recovery endpoints. */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.NODE_ENV === 'production' ? 20 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many authentication attempts. Please try again later.' }
});
