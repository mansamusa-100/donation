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
import { finalizeEasypayIntentPaid } from '../lib/finalizeEasypayIntent.js';

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
  return event.trim().toLowerCase().replace(/[\s-]+/g, '.');
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

  const { event, paymentId, partnerExternalBookingId, amount, paymentStatus } = body.data;

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
