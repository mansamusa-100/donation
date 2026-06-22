import type { CookieOptions, Request, Response } from 'express';
import { env } from '../config/env.js';

export const AUTH_COOKIE_NAME = 'barakahfund_session';

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function baseCookieOptions(): CookieOptions {
  const secure = env.NODE_ENV === 'production';
  const domain = env.AUTH_COOKIE_DOMAIN.trim();
  return {
    httpOnly: true,
    secure,
    sameSite: env.AUTH_COOKIE_SAME_SITE,
    path: '/',
    ...(domain ? { domain } : {})
  };
}

export function setAuthCookie(res: Response, token: string): void {
  res.cookie(AUTH_COOKIE_NAME, token, {
    ...baseCookieOptions(),
    maxAge: SESSION_MAX_AGE_MS
  });
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE_NAME, baseCookieOptions());
}

/** Prefer httpOnly session cookie; fall back to Authorization header for tooling. */
export function readAuthToken(req: Request): string | undefined {
  const fromCookie = req.cookies?.[AUTH_COOKIE_NAME];
  if (typeof fromCookie === 'string' && fromCookie.length > 0) {
    return fromCookie;
  }

  const authHeader = req.headers.authorization;
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;
  return bearer || undefined;
}
