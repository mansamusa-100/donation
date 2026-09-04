import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import {
  mergeEasypayPartnerWebhookPayload,
  applyEasypaySnakeCaseAliases
} from '../lib/easypayPartnerPayload.js';
import { finalizeEasypayIntentPaid, EasypayAmountMismatchError } from '../lib/finalizeEasypayIntent.js';
import { reverseEasypayIntent } from '../lib/reverseEasypayIntent.js';

function verifyEasypayPartnerWebhook(
  rawBody: string,
  signatureHeader: string | undefined,
  secret: string
): boolean {
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')}`;
  const got = (signatureHeader ?? '').trim();
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(got));
  } catch {
    return false;
  }
}

const webhookBodySchema = z.object({
  event: z.string(),
  paymentId: z.string().optional(),
  partnerExternalBookingId: z.string().optional(),
  amount: z.union([z.number(), z.string()]).optional(),
  paymentStatus: z.string().optional(),
  reason: z.string().optional()
});

function normalizePartnerEvent(event: string): string {
  return event.trim().toLowerCase().replace(/[\s._-]+/g, '.');
}

function isPaymentCompletedEvent(event: string): boolean {
  const n = normalizePartnerEvent(event);
  return (
    n === 'payment.completed' ||
    n === 'payment.complete' ||
    n === 'payment.succeeded' ||
    n === 'payment.success'
  );
}

const REVERSAL_EVENT_TOKENS = new Set([
  'payment.reversed',
  'payment.reversal',
  'payment.refunded',
  'payment.refund',
  'payment.chargeback',
  'order.reversed',
  'order.refunded',
  'reversed',
  'reversal',
  'refunded',
  'refund',
  'chargeback'
]);

function isPaymentReversedEvent(event: string, paymentStatus?: string): boolean {
  const tokens = [event, paymentStatus ?? ''].map(normalizePartnerEvent).filter(Boolean);
  return tokens.some(
    (t) =>
      REVERSAL_EVENT_TOKENS.has(t) ||
      t.endsWith('.reversed') ||
      t.endsWith('.refunded') ||
      t.endsWith('.chargeback')
  );
}

/**
 * POST with `express.raw({ type: 'application/json' })` — body must be raw UTF-8 bytes Easypay signed.
 */
export async function handleEasypayPartnerWebhook(req: Request, res: Response): Promise<void> {
  const secret = env.INTERNAL_PARTNER_WEBHOOK_SECRET.trim();
  if (!secret) {
    res.status(503).json({ message: 'Webhook verifier not configured' });
    return;
  }

  const raw =
    req.body instanceof Buffer ? req.body.toString('utf8') : String(req.body ?? '');

  if (!verifyEasypayPartnerWebhook(raw, req.get('x-easypay-signature'), secret)) {
    res.status(401).json({ message: 'Invalid signature' });
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    res.status(400).json({ message: 'Invalid JSON' });
    return;
  }

  const merged = mergeEasypayPartnerWebhookPayload(parsed);
  applyEasypaySnakeCaseAliases(merged);
  const body = webhookBodySchema.safeParse(merged);
  if (!body.success) {
    console.warn('[easypay webhook] invalid payload shape', body.error.flatten());
    res.status(400).json({ message: 'Invalid payload' });
    return;
  }

  const { event, paymentId, partnerExternalBookingId, amount, paymentStatus, reason } = body.data;

  if (isPaymentReversedEvent(event, paymentStatus)) {
    if (!partnerExternalBookingId) {
      console.warn('[easypay webhook] reversal missing partnerExternalBookingId', {
        event,
        paymentId,
        paymentStatus
      });
      res.status(400).json({ message: 'Missing partnerExternalBookingId' });
      return;
    }

    try {
      const result = await reverseEasypayIntent({
        partnerExternalBookingId,
        reason: reason ?? paymentStatus ?? event
      });
      if (result.unknownBooking) {
        console.warn('[easypay webhook] reversal for unknown partnerExternalBookingId', partnerExternalBookingId);
      }
    } catch (err) {
      console.error('[easypay webhook] reverse failed', {
        partnerExternalBookingId,
        paymentId,
        err
      });
      res.status(500).json({ message: 'Failed to record reversal' });
      return;
    }

    const reversalPaymentId = paymentId?.trim() || `epay-reversal:${partnerExternalBookingId}`;
    try {
      await prisma.easypayWebhookReceipt.create({
        data: { paymentId: reversalPaymentId, event: 'payment.reversed' }
      });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) {
        console.error('[easypay webhook] reversal receipt create failed', e);
      }
    }

    res.status(200).json({ ok: true, reversed: true });
    return;
  }

  if (!isPaymentCompletedEvent(event)) {
    // Still ACK cancelled/failed so DPay stops retrying.
    res.status(200).json({ ok: true, ignored: true, event });
    return;
  }

  if (!paymentId || !partnerExternalBookingId) {
    console.warn('[easypay webhook] completed event missing ids', {
      event,
      paymentId,
      partnerExternalBookingId,
      paymentStatus
    });
    res.status(400).json({ message: 'Missing paymentId or partnerExternalBookingId' });
    return;
  }

  const intent = await prisma.easypayPaymentIntent.findUnique({
    where: { partnerExternalBookingId },
    include: { campaign: true }
  });

  if (!intent) {
    console.warn('[easypay webhook] unknown partnerExternalBookingId', partnerExternalBookingId);
    // ACK so partner does not retry forever for orphan deliveries.
    res.status(200).json({ ok: true, unknownBooking: true });
    return;
  }

  // Finalize BEFORE recording the receipt. Previously we stored the receipt first; if finalize
  // returned early (e.g. amount mismatch), DPay got 200 and never retried, while our UI stayed pending.
  try {
    await finalizeEasypayIntentPaid({
      intent,
      webhookPaymentId: paymentId,
      grossAmountFromWebhook: amount
    });
  } catch (err) {
    if (err instanceof EasypayAmountMismatchError) {
      console.error('[easypay webhook] amount mismatch — not recording donation', {
        partnerExternalBookingId,
        paymentId,
        expectedGrossCents: err.expectedGrossCents,
        gotCents: err.gotCents
      });
      // ACK so partner stops retrying; do not write a completed receipt that would block ops replay after fix.
      res.status(200).json({ ok: false, amountMismatch: true });
      return;
    }
    console.error('[easypay webhook] finalize failed', {
      partnerExternalBookingId,
      paymentId,
      err
    });
    // Non-2xx so DPay retries.
    res.status(500).json({ message: 'Failed to record donation' });
    return;
  }

  try {
    await prisma.easypayWebhookReceipt.create({
      data: { paymentId, event: 'payment.completed' }
    });
  } catch (e) {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) {
      console.error('[easypay webhook] receipt create failed after finalize', e);
    }
  }

  res.status(200).json({ ok: true });
}
