import crypto from 'node:crypto';
import { env } from '../config/env.js';

export type WaveCheckoutSessionResponse = {
  id: string;
  amount: string;
  currency: string;
  wave_launch_url: string;
  client_reference?: string | null;
  checkout_status: string;
  payment_status: string;
  success_url?: string;
  error_url?: string;
  transaction_id?: string;
};

type WaveErrorBody = {
  error?: { message?: string; code?: string; httpcode?: number };
};

function signingHeaders(rawBody: string | undefined): Record<string, string> {
  if (!env.WAVE_SIGNING_SECRET) {
    return {};
  }
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = rawBody !== undefined ? `${timestamp}${rawBody}` : String(timestamp);
  const signature = crypto
    .createHmac('sha256', env.WAVE_SIGNING_SECRET)
    .update(payload)
    .digest('hex');
  return {
    'Wave-Signature': `t=${timestamp},v1=${signature}`
  };
}

export async function waveCreateCheckoutSession(body: {
  amount: string;
  currency: string;
  success_url: string;
  error_url: string;
  client_reference: string;
}): Promise<WaveCheckoutSessionResponse> {
  if (!env.WAVE_API_KEY.trim()) {
    throw new Error('Wave payments are not configured (missing WAVE_API_KEY)');
  }

  const rawBody = JSON.stringify(body);
  const url = `${env.WAVE_API_BASE_URL.replace(/\/$/, '')}/v1/checkout/sessions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.WAVE_API_KEY}`,
      'Content-Type': 'application/json',
      ...signingHeaders(rawBody)
    },
    body: rawBody
  });

  const data = (await res.json()) as WaveErrorBody & Partial<WaveCheckoutSessionResponse>;
  if (!res.ok) {
    const msg = data.error?.message ?? `Wave checkout error (${res.status})`;
    throw new Error(msg);
  }

  if (!data.wave_launch_url || !data.id) {
    throw new Error('Invalid Wave response: missing session id or launch URL');
  }

  return data as WaveCheckoutSessionResponse;
}

export async function waveGetCheckoutSession(
  sessionId: string
): Promise<WaveCheckoutSessionResponse> {
  if (!env.WAVE_API_KEY.trim()) {
    throw new Error('Wave payments are not configured (missing WAVE_API_KEY)');
  }

  const url = `${env.WAVE_API_BASE_URL.replace(/\/$/, '')}/v1/checkout/sessions/${encodeURIComponent(sessionId)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${env.WAVE_API_KEY}`,
      ...signingHeaders('')
    }
  });

  const data = (await res.json()) as WaveErrorBody & Partial<WaveCheckoutSessionResponse>;
  if (!res.ok) {
    const msg = data.error?.message ?? `Wave checkout fetch error (${res.status})`;
    throw new Error(msg);
  }

  return data as WaveCheckoutSessionResponse;
}

/** Returns true if Wave-reported gross amount matches our expected charge (compared in bututs/cents). */
export function waveAmountMatchesExpected(amountStr: string, expected: number): boolean {
  const n = Number.parseFloat(amountStr);
  if (!Number.isFinite(n)) {
    return false;
  }
  return Math.round(n * 100) === Math.round(expected * 100);
}
