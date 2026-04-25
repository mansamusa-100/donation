import crypto from 'node:crypto';
import type { Request } from 'express';
import { env } from '../config/env.js';

/** Wave docs: HMAC-SHA256 over `timestamp + rawBody`, header like `t=...,v1=...`. */
export function verifyWaveWebhookSignature(
  rawBody: string,
  waveSignatureHeader: string | undefined,
  webhookSecret: string
): boolean {
  if (!waveSignatureHeader?.trim()) {
    return false;
  }
  const parts = waveSignatureHeader.split(',').map((p) => p.trim());
  const timestampPart = parts.find((p) => p.startsWith('t='));
  const timestamp = timestampPart?.split('=', 2)[1];
  if (!timestamp) {
    return false;
  }
  const signatures = parts
    .filter((p) => p.startsWith('v1='))
    .map((p) => p.slice('v1='.length));
  if (signatures.length === 0) {
    return false;
  }
  const payload = timestamp + rawBody;
  const calculated = crypto.createHmac('sha256', webhookSecret).update(payload).digest('hex');
  return signatures.includes(calculated);
}

export function webhookAuthOk(req: Request, rawBody: string): boolean {
  const bearerExpected = env.WAVE_WEBHOOK_BEARER.trim();
  const hmacSecret = env.WAVE_WEBHOOK_SECRET.trim();

  if (!bearerExpected && !hmacSecret) {
    return false;
  }

  if (bearerExpected) {
    const auth = req.headers.authorization;
    if (auth === `Bearer ${bearerExpected}`) {
      return true;
    }
  }

  if (hmacSecret) {
    const waveSig = req.headers['wave-signature'];
    const header = Array.isArray(waveSig) ? waveSig[0] : waveSig;
    if (verifyWaveWebhookSignature(rawBody, header, hmacSecret)) {
      return true;
    }
  }

  return false;
}
