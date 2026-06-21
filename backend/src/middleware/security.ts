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

export const helmetMiddleware: RequestHandler = helmet({
  // Tune CSP per deployment (Google Sign-In, Easypay iframe, etc.) at the reverse proxy if needed.
  contentSecurityPolicy: false,
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
