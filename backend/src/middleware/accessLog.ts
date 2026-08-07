import type { RequestHandler } from 'express';

/** Paths that would drown the log (health probes, etc.). */
const SKIP_EXACT = new Set(['/api/health', '/api/health/']);

function shouldSkip(path: string): boolean {
  if (SKIP_EXACT.has(path)) {
    return true;
  }
  // Vite/static asset noise when API also serves the SPA
  if (
    path.startsWith('/assets/') ||
    path.startsWith('/uploads/') ||
    path === '/favicon.ico' ||
    path === '/log.png' ||
    path === '/log.svg' ||
    path === '/manifest.webmanifest' ||
    path === '/sw.js' ||
    path === '/registerSW.js'
  ) {
    return true;
  }
  return false;
}

/**
 * Lightweight access log: method, path, status, duration, IP.
 * No bodies, query strings, or headers (avoids secrets / PII flood).
 */
export const accessLogMiddleware: RequestHandler = (req, res, next) => {
  if (shouldSkip(req.path)) {
    next();
    return;
  }

  const started = process.hrtime.bigint();

  res.on('finish', () => {
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
    const ip = req.ip || req.socket.remoteAddress || '-';
    const status = res.statusCode;
    const line = `[http] ${req.method} ${req.path} ${status} ${elapsedMs.toFixed(0)}ms ip=${ip}`;

    if (status >= 500) {
      console.error(line);
    } else if (status >= 400) {
      console.warn(line);
    } else {
      console.info(line);
    }
  });

  next();
};
