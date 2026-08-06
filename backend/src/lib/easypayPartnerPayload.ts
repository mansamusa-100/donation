/**
 * Normalize Easypay partner JSON shapes (camelCase + snake_case, nested `data`).
 */

export function mergeEasypayPartnerWebhookPayload(parsed: unknown): Record<string, unknown> {
  if (!parsed || typeof parsed !== 'object' || parsed === null) {
    return {};
  }
  const top = parsed as Record<string, unknown>;
  const rawData = top.data;
  const inner =
    rawData && typeof rawData === 'object' && !Array.isArray(rawData)
      ? (rawData as Record<string, unknown>)
      : {};
  return { ...top, ...inner };
}

export function applyEasypaySnakeCaseAliases(r: Record<string, unknown>): void {
  const pairs: [string, string][] = [
    ['payment_id', 'paymentId'],
    ['partner_external_booking_id', 'partnerExternalBookingId'],
    ['payment_status', 'paymentStatus']
  ];
  for (const [snake, camel] of pairs) {
    if (r[camel] == null && r[snake] != null) {
      r[camel] = r[snake];
    }
  }
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

function paymentIdFromRecord(r: Record<string, unknown>): string | undefined {
  const payment = asRecord(r.payment);
  const firstFromPaymentsArr = (): unknown => {
    const payments = r.payments;
    if (!Array.isArray(payments) || payments.length === 0) {
      return undefined;
    }
    const p0 = asRecord(payments[0]);
    return p0?.id ?? p0?.paymentId ?? p0?.payment_id;
  };

  const raw =
    r.paymentId ??
    r.payment_id ??
    r.orderPaymentId ??
    r.order_payment_id ??
    r.payId ??
    r.pay_id ??
    r.externalPaymentId ??
    r.external_payment_id ??
    r.apsPaymentReference ??
    r.aps_payment_reference ??
    r.providerRef ??
    r.provider_ref ??
    r.reference ??
    (payment?.id != null ? payment.id : undefined) ??
    (payment?.paymentId != null ? payment.paymentId : undefined) ??
    (payment?.payment_id != null ? payment.payment_id : undefined) ??
    firstFromPaymentsArr();

  if (raw == null) {
    return undefined;
  }
  const s = String(raw).trim();
  return s !== '' ? s : undefined;
}

/** Shallow layers Easypay often nests under (`data`, `result`, `payload`). */
function collectEasypayResponseLayers(obj: unknown): Record<string, unknown>[] {
  const layers: Record<string, unknown>[] = [];
  const seen = new Set<Record<string, unknown>>();
  const visit = (v: unknown) => {
    const r = asRecord(v);
    if (!r || seen.has(r)) {
      return;
    }
    seen.add(r);
    layers.push(r);
    for (const key of ['data', 'result', 'payload'] as const) {
      visit(r[key]);
    }
  };
  visit(obj);
  return layers;
}

/**
 * Pull payment id / booking id / amount from nested partner API or webhook-style objects.
 */
export function extractEasypayPaymentMetadata(obj: unknown): {
  paymentId?: string;
  partnerExternalBookingId?: string;
  amount?: unknown;
} {
  const layers = collectEasypayResponseLayers(obj);
  if (layers.length === 0) {
    return {};
  }

  let payId: string | undefined;
  for (const r of layers) {
    payId = paymentIdFromRecord(r);
    if (payId) {
      break;
    }
  }

  let booking: string | undefined;
  let amount: unknown;
  for (const r of layers) {
    if (!booking) {
      const b =
        r.partnerExternalBookingId ??
        r.partner_external_booking_id ??
        r.bookingId ??
        r.booking_id;
      if (b != null && String(b).trim() !== '') {
        booking = String(b);
      }
    }
    if (amount == null) {
      const order = asRecord(r.order);
      amount =
        r.amount ??
        r.total ??
        r.totalAmount ??
        r.total_amount ??
        r.grossAmount ??
        r.gross_amount ??
        order?.total ??
        order?.amount ??
        order?.totalAmount ??
        order?.total_amount;
    }
  }

  return {
    paymentId: payId,
    partnerExternalBookingId: booking,
    amount
  };
}

const PAID_STATUS_ALLOWLIST = new Set([
  'paid',
  'completed',
  'complete',
  'succeeded',
  'success',
  'settled'
]);

function normalizeStatusToken(status: string): string {
  return status.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

/**
 * True when APS/complete (or similar) partner JSON explicitly says the order/payment is paid.
 * Prefer boolean `paid: true` (Easypay APS logs) over loose substring matching.
 */
export function easypayPartnerPayloadIndicatesPaid(data: unknown): boolean {
  const layers = collectEasypayResponseLayers(data);
  for (const r of layers) {
    if (r.paid === true) {
      return true;
    }
    const ps = r.paymentStatus ?? r.payment_status ?? r.status;
    if (typeof ps !== 'string') {
      continue;
    }
    const n = normalizeStatusToken(ps);
    if (!n || n === 'unpaid' || n === 'not_paid' || n.includes('unpaid')) {
      continue;
    }
    if (PAID_STATUS_ALLOWLIST.has(n) || (n.endsWith('_paid') && n !== 'not_paid')) {
      return true;
    }
  }
  return false;
}

/**
 * When true, do not treat APS `complete` as paid solely from HTTP 2xx (e.g. still pending OTP round-trip).
 */
export function easypayPartnerPayloadIndicatesPaymentIncomplete(data: unknown): boolean {
  const layers = collectEasypayResponseLayers(data);
  for (const r of layers) {
    if (r.paid === true) {
      return false;
    }
    const ps = r.paymentStatus ?? r.payment_status ?? r.status;
    if (typeof ps !== 'string') {
      continue;
    }
    const n = normalizeStatusToken(ps);
    if (
      n.includes('fail') ||
      n.includes('cancel') ||
      n === 'pending' ||
      n === 'requires_action' ||
      n === 'processing' ||
      n === 'started' ||
      n === 'authorized'
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Safe reconcile signal: Easypay create-order returns 409 with an explicit
 * "already paid" error for this partner booking (not a bare/ambiguous 409).
 */
export function partnerCreateOrderErrorIndicatesAlreadyPaid(err: {
  status: number;
  message: string;
  body: unknown;
}): boolean {
  if (err.status !== 409) {
    return false;
  }
  const parts: string[] = [err.message];
  if (err.body && typeof err.body === 'object' && !Array.isArray(err.body)) {
    const b = err.body as Record<string, unknown>;
    for (const key of ['error', 'message', 'detail'] as const) {
      if (typeof b[key] === 'string') {
        parts.push(b[key] as string);
      }
    }
  }
  const text = parts.join(' ').toLowerCase();
  if (text.includes('unpaid') || text.includes('not_paid') || text.includes('not paid')) {
    return false;
  }
  return (
    text.includes('already paid') ||
    text.includes('already_paid') ||
    text.includes('partner booking is already paid')
  );
}
