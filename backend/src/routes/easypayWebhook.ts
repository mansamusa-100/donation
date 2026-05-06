import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
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

  const tryParse = (v: unknown) => webhookBodySchema.safeParse(v);
  let body = tryParse(parsed);
  if (
    !body.success &&
    parsed &&
    typeof parsed === 'object' &&
    parsed !== null &&
    'data' in parsed
  ) {
    body = tryParse((parsed as { data: unknown }).data);
  }
  if (!body.success) {
    res.status(400).json({ message: 'Invalid payload' });
    return;
  }

  const { event, paymentId, partnerExternalBookingId, amount } = body.data;

  if (event === 'payment.completed') {
    if (!paymentId || !partnerExternalBookingId) {
      res.status(400).json({ message: 'Missing paymentId or partnerExternalBookingId' });
      return;
    }

    try {
      await prisma.easypayWebhookReceipt.create({
        data: { paymentId, event }
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        res.status(200).json({ ok: true, duplicate: true });
        return;
      }
      throw e;
    }

    const intent = await prisma.easypayPaymentIntent.findUnique({
      where: { partnerExternalBookingId },
      include: { campaign: true }
    });

    if (!intent) {
      console.warn('[easypay webhook] unknown partnerExternalBookingId', partnerExternalBookingId);
      res.status(200).json({ ok: true });
      return;
    }

    await finalizeEasypayIntentPaid({
      intent,
      webhookPaymentId: paymentId,
      grossAmountFromWebhook: amount
    });
    res.status(200).json({ ok: true });
    return;
  }

  res.status(200).json({ ok: true });
}
