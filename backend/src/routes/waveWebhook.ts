import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { webhookAuthOk } from '../lib/waveWebhookVerify.js';
import { finalizeWaveIntentFromCheckoutSession } from '../lib/waveFinalizeIntent.js';

function rawBodyString(req: Request): string {
  const b = req.body;
  if (Buffer.isBuffer(b)) {
    return b.toString('utf8');
  }
  if (typeof b === 'string') {
    return b;
  }
  return '';
}

async function findIntentForCheckoutData(data: {
  id?: string;
  client_reference?: string | null;
}) {
  const ref = typeof data.client_reference === 'string' ? data.client_reference.trim() : '';
  if (ref.length > 0) {
    const byRef = await prisma.wavePaymentIntent.findUnique({
      where: { clientReference: ref },
      include: { campaign: true }
    });
    if (byRef) {
      return byRef;
    }
  }
  const sid = typeof data.id === 'string' ? data.id.trim() : '';
  if (sid.length > 0) {
    const bySession = await prisma.wavePaymentIntent.findFirst({
      where: { waveSessionId: sid },
      include: { campaign: true }
    });
    if (bySession) {
      return bySession;
    }
  }
  return null;
}

/**
 * POST /api/payments/wave/webhook — must be mounted with `express.raw({ type: 'application/json' })`
 * before the global `express.json()` middleware so HMAC is computed over the exact body bytes.
 */
export async function handleWaveWebhook(req: Request, res: Response): Promise<void> {
  if (!env.WAVE_API_KEY.trim()) {
    res.status(503).json({ message: 'Wave Checkout is not configured.' });
    return;
  }

  const bearerConfigured = env.WAVE_WEBHOOK_BEARER.trim().length > 0;
  const hmacConfigured = env.WAVE_WEBHOOK_SECRET.trim().length > 0;
  if (!bearerConfigured && !hmacConfigured) {
    res.status(503).json({
      message:
        'Wave webhooks are not configured. Set WAVE_WEBHOOK_SECRET and/or WAVE_WEBHOOK_BEARER (from the Wave Business portal).'
    });
    return;
  }

  const raw = rawBodyString(req);

  if (!webhookAuthOk(req, raw)) {
    res.status(401).json({ message: 'Invalid webhook authentication' });
    return;
  }

  let event: { type?: string; data?: Record<string, unknown> };
  try {
    event = JSON.parse(raw) as { type?: string; data?: Record<string, unknown> };
  } catch {
    res.status(400).json({ message: 'Invalid JSON body' });
    return;
  }

  const type = event.type;
  const data = event.data;

  if (type === 'test.test_event') {
    res.status(200).json({ ok: true });
    return;
  }

  if (!data || typeof data !== 'object') {
    res.status(200).json({ ok: true, ignored: true });
    return;
  }

  if (type === 'checkout.session.completed') {
    const sessionData = data as {
      id?: string;
      amount?: string;
      checkout_status?: string;
      payment_status?: string;
      client_reference?: string | null;
    };

    const amount = typeof sessionData.amount === 'string' ? sessionData.amount : '';
    const checkoutStatus = typeof sessionData.checkout_status === 'string' ? sessionData.checkout_status : '';
    const paymentStatus = typeof sessionData.payment_status === 'string' ? sessionData.payment_status : '';

    const intent = await findIntentForCheckoutData({
      id: sessionData.id,
      client_reference: sessionData.client_reference
    });

    if (!intent) {
      console.warn('[wave webhook] checkout.session.completed: no matching WavePaymentIntent', {
        client_reference: sessionData.client_reference,
        sessionId: sessionData.id
      });
      res.status(200).json({ ok: true, ignored: 'intent_not_found' });
      return;
    }

    const result = await finalizeWaveIntentFromCheckoutSession(intent, {
      amount,
      checkout_status: checkoutStatus,
      payment_status: paymentStatus
    });

    if (result.kind === 'amount_mismatch') {
      console.error('[wave webhook] amount mismatch', {
        intentId: intent.id,
        clientReference: intent.clientReference
      });
    }

    res.status(200).json({ ok: true, result: result.kind });
    return;
  }

  if (type === 'checkout.session.payment_failed') {
    const failData = data as {
      id?: string;
      checkout_status?: string;
      payment_status?: string;
      client_reference?: string | null;
    };

    const intent = await findIntentForCheckoutData({
      id: failData.id,
      client_reference: failData.client_reference
    });

    if (intent) {
      await prisma.wavePaymentIntent.update({
        where: { id: intent.id },
        data: {
          waveCheckoutStatus: failData.checkout_status ?? 'failed',
          wavePaymentStatus: failData.payment_status ?? 'failed'
        }
      });
    }

    res.status(200).json({ ok: true });
    return;
  }

  res.status(200).json({ ok: true, ignored: true });
}
