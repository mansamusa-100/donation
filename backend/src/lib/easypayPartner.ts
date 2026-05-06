import { env } from '../config/env.js';

export class EasypayPartnerApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = 'EasypayPartnerApiError';
    this.status = status;
    this.body = body;
  }
}

export type EasypayPartnerOrder = {
  id: string;
  publicCode: string;
  status: string;
  total: number;
  currency: string;
  partnerExternalBookingId: string | null;
};

export type NormalizedCheckoutWallet = {
  gatewayId: string;
  code: string;
  name: string;
  checkoutAdapter: string;
  hasStoredPayerPhone: boolean;
};

export type EasypayWalletStartResult = {
  payment: Record<string, unknown>;
  qrPayload: string;
  launchUrl: string;
  paymentHtml: string | null;
  checkoutAdapter: string;
};

export type EasypayProvisionResult = {
  businessId: string;
  userId: string;
  subscriptionId: string;
  slug: string;
  idempotentReplay: boolean;
};

/** Base URL + API secret only (e.g. admin provision before businessId exists). */
export function getEasypayPartnerApiCredentialsOk(): boolean {
  const baseUrl = env.EASYPAY_API_BASE_URL.replace(/\/$/, '').trim();
  const apiSecret = env.INTERNAL_PARTNER_API_SECRET.trim();
  return Boolean(baseUrl && apiSecret);
}

/** Credentials + platform business id — required for donor checkout. */
export function easypayPartnerConfigured(): boolean {
  return getEasypayPartnerApiCredentialsOk() && env.EASYPAY_PARTNER_BUSINESS_ID.trim().length > 0;
}

export function getPlatformEasypayBusinessId(): string {
  return env.EASYPAY_PARTNER_BUSINESS_ID.trim();
}

export async function partnerJson<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const baseUrl = env.EASYPAY_API_BASE_URL.replace(/\/$/, '').trim();
  const apiSecret = env.INTERNAL_PARTNER_API_SECRET.trim();
  if (!baseUrl || !apiSecret) {
    throw new EasypayPartnerApiError(503, 'Easypay partner API is not configured', {});
  }
  const url = `${baseUrl}/api/internal-partner/v1${path.startsWith('/') ? path : `/${path}`}`;
  const method = init.method ?? 'GET';
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiSecret}`,
    Accept: 'application/json'
  };
  let bodyStr: string | undefined;
  if (init.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    bodyStr = JSON.stringify(init.body);
  }
  const res = await fetch(url, { method, headers, body: bodyStr });
  const text = await res.text();
  let json: unknown = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new EasypayPartnerApiError(
      res.status,
      `Easypay ${method} ${path} failed: ${res.status} ${text.slice(0, 500)}`,
      json
    );
  }
  return json as T;
}

function extractWalletsPayload(json: Record<string, unknown>): unknown[] {
  const d = json.data as unknown;
  if (!d) return [];
  if (Array.isArray(d)) return d;
  if (typeof d !== 'object' || d === null) return [];
  const obj = d as Record<string, unknown>;
  if (Array.isArray(obj.wallets)) return obj.wallets;
  if (Array.isArray(obj.checkoutWallets)) return obj.checkoutWallets;
  if (Array.isArray(obj.gatewayWallets)) return obj.gatewayWallets;
  if (Array.isArray(obj.items)) return obj.items;
  const nested = obj.data;
  if (nested && typeof nested === 'object' && nested !== null) {
    const w = (nested as Record<string, unknown>).wallets;
    if (Array.isArray(w)) return w;
  }
  return [];
}

function normalizeWalletRow(raw: unknown): NormalizedCheckoutWallet | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const gatewayNested =
    row.gateway && typeof row.gateway === 'object' ? (row.gateway as Record<string, unknown>) : null;
  const code = String(
    row.code ?? row.gatewayCode ?? gatewayNested?.code ?? ''
  ).trim();
  if (!code) return null;
  const gatewayId = String(row.gatewayId ?? row.id ?? gatewayNested?.id ?? code).trim() || code;
  const name = String(
    row.name ?? row.label ?? row.title ?? row.displayName ?? code
  ).trim() || code;
  const checkoutAdapter = String(
    row.checkoutAdapter ?? row.adapter ?? row.type ?? ''
  ).trim();
  return {
    gatewayId,
    code,
    name,
    checkoutAdapter,
    hasStoredPayerPhone: Boolean(row.hasStoredPayerPhone)
  };
}

function pickString(obj: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function findFirstLaunchableUrlInValue(value: unknown, depth = 0): string {
  if (depth > 8) return '';
  if (typeof value === 'string') {
    const s = value.trim();
    if (/^https?:\/\//i.test(s) && s.length < 4096) return s;
    if (/^(wave|wv|intent|mailto):/i.test(s) && s.length < 4096) return s;
    return '';
  }
  if (!value || typeof value !== 'object') return '';
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstLaunchableUrlInValue(item, depth + 1);
      if (found) return found;
    }
    return '';
  }
  for (const v of Object.values(value as Record<string, unknown>)) {
    const found = findFirstLaunchableUrlInValue(v, depth + 1);
    if (found) return found;
  }
  return '';
}

function normalizeWalletCheckoutFromPartnerResponse(json: unknown): EasypayWalletStartResult {
  const j = json && typeof json === 'object' ? (json as Record<string, unknown>) : {};
  const data =
    j.data != null && typeof j.data === 'object' ? (j.data as Record<string, unknown>) : j;
  const root = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const paymentObj =
    root.payment && typeof root.payment === 'object'
      ? (root.payment as Record<string, unknown>)
      : {};
  const urlKeys = [
    'launchUrl',
    'launch_url',
    'checkoutUrl',
    'checkout_url',
    'redirectUrl',
    'redirect_url',
    'url',
    'paymentUrl',
    'payment_url',
    'deepLink',
    'deep_link',
    'mobileLaunchUrl',
    'mobile_launch_url',
    'waveUrl',
    'wave_url',
    'href',
    'link'
  ];
  let launchUrl = pickString(root, urlKeys) || pickString(paymentObj, urlKeys);
  const checkoutAdapter =
    pickString(root, ['checkoutAdapter', 'checkout_adapter', 'adapter']) ||
    pickString(paymentObj, ['checkoutAdapter', 'checkout_adapter', 'adapter']);
  const qrPayload =
    pickString(root, ['qrPayload', 'qr_payload', 'qr']) ||
    pickString(paymentObj, ['qrPayload', 'qr_payload', 'qr']);
  const paymentHtmlRaw =
    pickString(root, ['paymentHtml', 'payment_html']) ||
    pickString(paymentObj, ['paymentHtml', 'payment_html']) ||
    '';
  if (!launchUrl) {
    launchUrl =
      findFirstLaunchableUrlInValue(root) ||
      findFirstLaunchableUrlInValue(paymentObj) ||
      findFirstLaunchableUrlInValue(j);
  }
  if (!launchUrl) {
    const rk = Object.keys(root).join(',');
    const pk = Object.keys(paymentObj).join(',');
    throw new EasypayPartnerApiError(
      502,
      `Easypay wallet checkout returned no launch URL. data keys: ${rk || '(none)'}; payment keys: ${pk || '(none)'}`,
      json
    );
  }
  return {
    payment: Object.keys(paymentObj).length ? paymentObj : root,
    qrPayload,
    launchUrl,
    paymentHtml: paymentHtmlRaw || null,
    checkoutAdapter
  };
}

export async function provisionEasypayTenant(input: {
  externalUserId: string;
  ownerEmail: string;
  ownerName: string;
  businessName: string;
  slug?: string;
  industry?: string;
  webhookUrl?: string | null;
}): Promise<EasypayProvisionResult> {
  const json = await partnerJson<{ data: EasypayProvisionResult }>('/provision', {
    method: 'POST',
    body: input
  });
  return json.data;
}

export async function createEasypayOrder(
  businessId: string,
  input: { partnerExternalBookingId: string; amountGmd: number; currency?: string }
): Promise<EasypayPartnerOrder> {
  const json = (await partnerJson<Record<string, unknown>>(
    `/businesses/${encodeURIComponent(businessId)}/orders`,
    { method: 'POST', body: input }
  )) as Record<string, unknown>;
  const data = json.data as Record<string, unknown> | undefined;
  const rawOrder =
    (data?.order as Record<string, unknown> | undefined) ??
    (data as Record<string, unknown> | undefined);
  if (!rawOrder || typeof rawOrder !== 'object') {
    throw new EasypayPartnerApiError(
      502,
      `Easypay create order: missing order in response: ${JSON.stringify(json).slice(0, 400)}`,
      json
    );
  }
  const idVal = rawOrder.id ?? rawOrder.orderId ?? rawOrder.order_id;
  if (idVal == null || String(idVal).trim() === '') {
    throw new EasypayPartnerApiError(
      502,
      `Easypay create order: missing order id: ${JSON.stringify(json).slice(0, 400)}`,
      json
    );
  }
  return {
    ...rawOrder,
    id: String(idVal),
    publicCode: String(rawOrder.publicCode ?? rawOrder.public_code ?? ''),
    status: String(rawOrder.status ?? ''),
    total: Number(rawOrder.total ?? 0),
    currency: String(rawOrder.currency ?? 'GMD'),
    partnerExternalBookingId: (rawOrder.partnerExternalBookingId ??
      rawOrder.partner_external_booking_id ??
      null) as string | null
  };
}

export async function listEasypayWallets(
  businessId: string,
  orderId: string
): Promise<NormalizedCheckoutWallet[]> {
  const path = `/businesses/${encodeURIComponent(businessId)}/orders/${encodeURIComponent(orderId)}/checkout-wallets`;
  const json = (await partnerJson<Record<string, unknown>>(path, { method: 'GET' })) as Record<string, unknown>;
  const rawList = extractWalletsPayload(json);
  const normalized = rawList
    .map((w) => normalizeWalletRow(w))
    .filter((w): w is NormalizedCheckoutWallet => w != null);
  if (normalized.length === 0 && rawList.length > 0) {
    const first = rawList[0];
    const keys = first && typeof first === 'object' ? Object.keys(first as object).join(',') : '';
    console.warn(
      '[easypay] checkout-wallets: no usable gateway code. First row keys:',
      keys || '(n/a)'
    );
  }
  return normalized;
}

export function easypayGatewayCodeNeedsPayerPhone(gatewayCode: string): boolean {
  return String(gatewayCode || '').toLowerCase().includes('yonna');
}

export async function startEasypayWalletCheckout(
  businessId: string,
  orderId: string,
  body: { gatewayCode: string; payerPhone?: string; gatewayId?: string }
): Promise<EasypayWalletStartResult> {
  const rawPhone =
    body.payerPhone && String(body.payerPhone).trim() ? String(body.payerPhone).trim() : undefined;
  const phone =
    rawPhone && easypayGatewayCodeNeedsPayerPhone(body.gatewayCode) ? rawPhone : undefined;
  const gatewayId =
    body.gatewayId && String(body.gatewayId).trim() ? String(body.gatewayId).trim() : undefined;

  const path = `/businesses/${encodeURIComponent(businessId)}/orders/${encodeURIComponent(orderId)}/payments/wallet`;

  const camel: Record<string, string> = { gatewayCode: body.gatewayCode };
  if (phone) camel.payerPhone = phone;
  if (gatewayId) camel.gatewayId = gatewayId;

  const snake: Record<string, string> = { gateway_code: body.gatewayCode };
  if (phone) snake.payer_phone = phone;
  if (gatewayId) snake.gateway_id = gatewayId;

  const attempts = [camel, snake];
  let lastErr: unknown;
  for (let i = 0; i < attempts.length; i++) {
    try {
      const json = await partnerJson<unknown>(path, { method: 'POST', body: attempts[i] });
      return normalizeWalletCheckoutFromPartnerResponse(json);
    } catch (e) {
      lastErr = e;
      const st = e instanceof EasypayPartnerApiError ? e.status : 0;
      if (st === 500 && i < attempts.length - 1) {
        console.warn('[easypay] POST payments/wallet 500; retrying alternate JSON casing', {
          businessId,
          orderId,
          gatewayCode: body.gatewayCode
        });
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

export function pickCheckoutWallet(
  wallets: NormalizedCheckoutWallet[],
  channel: 'wave' | 'yonna' | 'aps'
): NormalizedCheckoutWallet | null {
  const needle = channel;
  return (
    wallets.find((w) => {
      const h = `${w.code} ${w.name} ${w.checkoutAdapter}`.toLowerCase();
      return h.includes(needle);
    }) ?? null
  );
}

/** @deprecated use pickCheckoutWallet */
export function pickGatewayCode(
  wallets: NormalizedCheckoutWallet[],
  channel: 'wave' | 'yonna' | 'aps'
): string | null {
  return pickCheckoutWallet(wallets, channel)?.code ?? null;
}

export async function authorizeEasypayApsWallet(
  businessId: string,
  orderId: string,
  body: { gatewayCode: string; payerMobile: string }
): Promise<{ authState: string; requiresOtp: boolean; raw: unknown }> {
  const b = encodeURIComponent(businessId);
  const o = encodeURIComponent(orderId);
  const paths = [
    `/businesses/${b}/orders/${o}/payments/aps-wallet/authorize`,
    `/businesses/${b}/orders/${o}/aps-wallet/authorize`
  ];
  let lastErr: unknown;
  for (let i = 0; i < paths.length; i++) {
    const path = paths[i];
    try {
      const json = (await partnerJson<Record<string, unknown>>(path, {
        method: 'POST',
        body
      })) as Record<string, unknown>;
      const d = (json.data ?? json) as Record<string, unknown>;
      const authState = String(d.authState ?? d.auth_state ?? '');
      return {
        authState,
        requiresOtp: Boolean(d.requiresOtp ?? d.requires_otp),
        raw: d
      };
    } catch (e) {
      lastErr = e;
      const st = e instanceof EasypayPartnerApiError ? e.status : 0;
      if (st === 404 && i < paths.length - 1) {
        console.warn('[easypay] APS authorize 404; retrying alternate path:', path);
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

export async function completeEasypayApsWallet(
  businessId: string,
  orderId: string,
  body: { gatewayCode: string; authState: string; otp?: string }
): Promise<unknown> {
  const b = encodeURIComponent(businessId);
  const o = encodeURIComponent(orderId);
  const paths = [
    `/businesses/${b}/orders/${o}/payments/aps-wallet/complete`,
    `/businesses/${b}/orders/${o}/aps-wallet/complete`
  ];
  let lastErr: unknown;
  for (let i = 0; i < paths.length; i++) {
    const path = paths[i];
    try {
      const json = await partnerJson<Record<string, unknown>>(path, { method: 'POST', body });
      return json.data ?? json;
    } catch (e) {
      lastErr = e;
      const st = e instanceof EasypayPartnerApiError ? e.status : 0;
      if (st === 404 && i < paths.length - 1) {
        console.warn('[easypay] APS complete 404; retrying alternate path:', path);
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

export async function cancelEasypayOrder(businessId: string, orderId: string): Promise<void> {
  if (!getEasypayPartnerApiCredentialsOk()) return;
  const baseUrl = env.EASYPAY_API_BASE_URL.replace(/\/$/, '');
  const url = `${baseUrl}/api/internal-partner/v1/businesses/${encodeURIComponent(businessId)}/orders/${encodeURIComponent(orderId)}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${env.INTERNAL_PARTNER_API_SECRET.trim()}` }
  });
  if (res.status !== 204 && res.status !== 404) {
    const t = await res.text().catch(() => '');
    console.warn('[easypay] cancel order non-204', res.status, t?.slice(0, 300));
  }
}

/* --- Platform env wrappers (single businessId in .env) --- */

export async function easypayCreateOrder(input: {
  partnerExternalBookingId: string;
  amountGmd: number;
  currency?: string;
}): Promise<EasypayPartnerOrder> {
  const bid = getPlatformEasypayBusinessId();
  if (!bid) {
    throw new EasypayPartnerApiError(503, 'EASYPAY_PARTNER_BUSINESS_ID is not set', {});
  }
  return createEasypayOrder(bid, input);
}

export async function easypayListWalletsForPlatform(orderId: string): Promise<NormalizedCheckoutWallet[]> {
  const bid = getPlatformEasypayBusinessId();
  if (!bid) {
    throw new EasypayPartnerApiError(503, 'EASYPAY_PARTNER_BUSINESS_ID is not set', {});
  }
  return listEasypayWallets(bid, orderId);
}

export async function easypayStartWalletCheckoutForPlatform(
  orderId: string,
  body: { gatewayCode: string; payerPhone?: string; gatewayId?: string }
): Promise<EasypayWalletStartResult> {
  const bid = getPlatformEasypayBusinessId();
  if (!bid) {
    throw new EasypayPartnerApiError(503, 'EASYPAY_PARTNER_BUSINESS_ID is not set', {});
  }
  return startEasypayWalletCheckout(bid, orderId, body);
}

export async function easypayApsAuthorizeForPlatform(
  orderId: string,
  body: { gatewayCode: string; payerMobile: string }
): Promise<{ authState: string; requiresOtp: boolean; raw: unknown }> {
  const bid = getPlatformEasypayBusinessId();
  if (!bid) {
    throw new EasypayPartnerApiError(503, 'EASYPAY_PARTNER_BUSINESS_ID is not set', {});
  }
  return authorizeEasypayApsWallet(bid, orderId, body);
}

export async function easypayApsCompleteForPlatform(
  orderId: string,
  body: { gatewayCode: string; authState: string; otp?: string }
): Promise<unknown> {
  const bid = getPlatformEasypayBusinessId();
  if (!bid) {
    throw new EasypayPartnerApiError(503, 'EASYPAY_PARTNER_BUSINESS_ID is not set', {});
  }
  return completeEasypayApsWallet(bid, orderId, body);
}
