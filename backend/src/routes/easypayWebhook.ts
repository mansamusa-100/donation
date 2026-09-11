import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import {
  mergeEasypayPartnerWebhookPayload,
  applyEasypaySnakeCaseAliases,
  extractEasypayPaymentMetadata
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

const webhookBodySchema = z
  .object({
    event: z.string().optional(),
    type: z.string().optional(),
    paymentId: z.string().optional(),
    partnerExternalBookingId: z.string().optional(),
    amount: z.union([z.number(), z.string()]).optional(),
    paymentStatus: z.string().optional(),
    status: z.string().optional(),
    reason: z.string().optional()
  })
  .passthrough();

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
  'transaction.reversed',
  'transaction.refunded',
  'reversed',
  'reversal',
  'refunded',
  'refund',
  'chargeback'
]);

function isPaymentReversedEvent(...candidates: Array<string | undefined>): boolean {
  const tokens = candidates.map((c) => (c ? normalizePartnerEvent(c) : '')).filter(Boolean);
  return tokens.some(
    (t) =>
      REVERSAL_EVENT_TOKENS.has(t) ||
      t.includes('revers') ||
      t.includes('refund') ||
      t.includes('chargeback')
  );
}

async function resolvePartnerExternalBookingId(params: {
  partnerExternalBookingId?: string;
  paymentId?: string;
  merged: Record<string, unknown>;
}): Promise<string | null> {
  const meta = extractEasypayPaymentMetadata(params.merged);
  const direct =
    params.partnerExternalBookingId?.trim() ||
    meta.partnerExternalBookingId?.trim() ||
    (typeof params.merged.bookingId === 'string' ? params.merged.bookingId.trim() : '') ||
    (typeof params.merged.booking_id === 'string' ? params.merged.booking_id.trim() : '') ||
    (typeof params.merged.externalBookingId === 'string'
      ? params.merged.externalBookingId.trim()
      : '') ||
    (typeof params.merged.external_booking_id === 'string'
      ? params.merged.external_booking_id.trim()
      : '');

  if (direct) {
    return direct;
  }

  const paymentId = params.paymentId?.trim() || meta.paymentId?.trim();
  if (!paymentId) {
    return null;
  }

  // Fall back: find the intent that recorded this payment id.
  const byPayment = await prisma.easypayPaymentIntent.findFirst({
    where: {
      OR: [
        { lastPaymentId: paymentId },
        { easypayOrderId: paymentId },
        { orderPublicCode: paymentId },
        { partnerExternalBookingId: paymentId }
      ]
    },
    select: { partnerExternalBookingId: true }
  });
  return byPayment?.partnerExternalBookingId ?? null;
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

  const event = (body.data.event ?? body.data.type ?? '').trim();
  const paymentStatus = body.data.paymentStatus ?? body.data.status;
  const paymentId = body.data.paymentId;
  const amount = body.data.amount;
  const reason = body.data.reason;

  if (!event) {
    console.warn('[easypay webhook] missing event/type', {
      keys: Object.keys(merged).slice(0, 30)
    });
    res.status(400).json({ message: 'Missing event' });
    return;
  }

  if (isPaymentReversedEvent(event, paymentStatus)) {
    const partnerExternalBookingId = await resolvePartnerExternalBookingId({
      partnerExternalBookingId: body.data.partnerExternalBookingId,
      paymentId,
      merged
    });

    if (!partnerExternalBookingId) {
      console.warn('[easypay webhook] reversal missing partnerExternalBookingId', {
        event,
        paymentId,
        paymentStatus,
        keys: Object.keys(merged).slice(0, 40)
      });
      // ACK so DPay does not retry forever; ops can reverse manually from admin.
      res.status(200).json({ ok: false, missingBookingId: true, event });
      return;
    }

    try {
      const result = await reverseEasypayIntent({
        partnerExternalBookingId,
        reason: reason ?? paymentStatus ?? event
      });
      console.info('[easypay webhook] reversal handled', {
        partnerExternalBookingId,
        paymentId,
        event,
        ...result
      });
      if (result.unknownBooking) {
        console.warn(
          '[easypay webhook] reversal for unknown partnerExternalBookingId',
          partnerExternalBookingId
        );
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
    console.info('[easypay webhook] ignored event', { event, paymentStatus });
    // Still ACK cancelled/failed so DPay stops retrying.
    res.status(200).json({ ok: true, ignored: true, event });
    return;
  }

  const meta = extractEasypayPaymentMetadata(merged);
  const partnerExternalBookingId =
    body.data.partnerExternalBookingId?.trim() || meta.partnerExternalBookingId?.trim() || '';
  const completedPaymentId = paymentId?.trim() || meta.paymentId?.trim() || '';

  if (!completedPaymentId || !partnerExternalBookingId) {
    console.warn('[easypay webhook] completed event missing ids', {
      event,
      paymentId: completedPaymentId,
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
      webhookPaymentId: completedPaymentId,
      grossAmountFromWebhook: amount ?? meta.amount
    });
  } catch (err) {
    if (err instanceof EasypayAmountMismatchError) {
      console.error('[easypay webhook] amount mismatch — not recording donation', {
        partnerExternalBookingId,
        paymentId: completedPaymentId,
        expectedGrossCents: err.expectedGrossCents,
        gotCents: err.gotCents
      });
      // ACK so partner stops retrying; do not write a completed receipt that would block ops replay after fix.
      res.status(200).json({ ok: false, amountMismatch: true });
      return;
    }
    console.error('[easypay webhook] finalize failed', {
      partnerExternalBookingId,
      paymentId: completedPaymentId,
      err
    });
    // Non-2xx so DPay retries.
    res.status(500).json({ message: 'Failed to record donation' });
    return;
  }

  try {
    await prisma.easypayWebhookReceipt.create({
      data: { paymentId: completedPaymentId, event: 'payment.completed' }
    });
  } catch (e) {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) {
      console.error('[easypay webhook] receipt create failed after finalize', e);
    }
  }

  res.status(200).json({ ok: true });
}
