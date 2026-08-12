import { env } from '../config/env.js';
import { sendEmail } from './mail.js';
import { buildBrandedEmail } from './emailLayout.js';

export type SecuritySignal =
  | 'failed_login'
  | 'admin_auth_probe'
  | 'auth_rate_limited';

type SignalConfig = {
  windowMs: number;
  threshold: number;
  cooldownMs: number;
  label: string;
};

const SIGNAL_CONFIG: Record<SecuritySignal, SignalConfig> = {
  failed_login: {
    windowMs: 10 * 60 * 1000,
    threshold: 8,
    cooldownMs: 45 * 60 * 1000,
    label: 'Failed login burst'
  },
  admin_auth_probe: {
    windowMs: 15 * 60 * 1000,
    threshold: 10,
    cooldownMs: 45 * 60 * 1000,
    label: 'Admin auth probe burst'
  },
  auth_rate_limited: {
    windowMs: 15 * 60 * 1000,
    threshold: 3,
    cooldownMs: 45 * 60 * 1000,
    label: 'Auth rate-limit hits'
  }
};

/** Per IP+signal: recent event timestamps (ms). */
const windows = new Map<string, number[]>();
/** Per IP+signal: last alert time (ms). */
const cooldowns = new Map<string, number>();

let lastPruneAt = 0;
const PRUNE_EVERY_MS = 5 * 60 * 1000;

function alertsEnabled(): boolean {
  const flag = env.SECURITY_ALERTS_ENABLED;
  if (flag === 'auto') {
    return env.NODE_ENV === 'production';
  }
  return flag;
}

function alertRecipients(): string[] {
  const raw = env.SECURITY_ALERT_TO.trim() || env.OWNER_EMAIL.trim();
  if (!raw) {
    return [];
  }
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function bucketKey(signal: SecuritySignal, ip: string): string {
  return `${signal}:${ip}`;
}

function pruneStale(now: number): void {
  if (now - lastPruneAt < PRUNE_EVERY_MS) {
    return;
  }
  lastPruneAt = now;

  for (const [key, stamps] of windows) {
    const signal = key.split(':')[0] as SecuritySignal;
    const cfg = SIGNAL_CONFIG[signal];
    if (!cfg) {
      windows.delete(key);
      continue;
    }
    const kept = stamps.filter((t) => now - t <= cfg.windowMs);
    if (kept.length === 0) {
      windows.delete(key);
    } else {
      windows.set(key, kept);
    }
  }

  for (const [key, at] of cooldowns) {
    const signal = key.split(':')[0] as SecuritySignal;
    const cfg = SIGNAL_CONFIG[signal];
    if (!cfg || now - at > cfg.cooldownMs) {
      cooldowns.delete(key);
    }
  }
}

function normalizePath(path: string): string {
  const bare = path.split('?')[0] || path;
  if (bare.length > 1 && bare.endsWith('/')) {
    return bare.slice(0, -1);
  }
  return bare;
}

/**
 * Classify a finished HTTP response into a security signal, or null if uninteresting.
 */
export function classifySecuritySignal(
  method: string,
  path: string,
  status: number
): SecuritySignal | null {
  const p = normalizePath(path);

  if (method === 'POST' && status === 401 && p === '/api/auth/login') {
    return 'failed_login';
  }

  if (status === 429 && p.startsWith('/api/auth')) {
    return 'auth_rate_limited';
  }

  if ((status === 401 || status === 403) && p.startsWith('/api/admin')) {
    return 'admin_auth_probe';
  }

  return null;
}

async function postWebhook(text: string): Promise<void> {
  const url = env.SECURITY_ALERT_WEBHOOK_URL.trim();
  if (!url) {
    return;
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: text,
      text
    })
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Webhook ${res.status}: ${body || res.statusText}`);
  }
}

async function sendAlertEmail(params: {
  signal: SecuritySignal;
  ip: string;
  count: number;
  method: string;
  path: string;
  status: number;
}): Promise<void> {
  const recipients = alertRecipients();
  if (recipients.length === 0) {
    return;
  }

  const cfg = SIGNAL_CONFIG[params.signal];
  const windowMin = Math.round(cfg.windowMs / 60000);
  const subject = `[Security] ${cfg.label} from ${params.ip}`;
  const details = [
    { label: 'Signal', value: cfg.label },
    { label: 'IP', value: params.ip },
    { label: 'Count', value: `${params.count} in ${windowMin} minutes` },
    { label: 'Last request', value: `${params.method} ${params.path} → ${params.status}` },
    { label: 'Time (UTC)', value: new Date().toISOString() }
  ];

  const content = {
    preheader: `${cfg.label}: ${params.count} events from ${params.ip}`,
    eyebrow: 'Security alert',
    title: cfg.label,
    paragraphs: [
      `An IP crossed the alert threshold on BarakahFund.`,
      `Review access logs for this address. Auth endpoints are already rate-limited; this is an early-notice signal only.`
    ],
    details,
    callouts: [
      {
        tone: 'danger' as const,
        title: 'Suggested checks',
        lines: [
          'Confirm whether the IP belongs to a known admin or staff network.',
          'Look for nearby failed logins or admin 401/403 spikes in the same window.',
          'If hostile, block at Caddy/firewall; rotate credentials if a password spray succeeded.'
        ]
      }
    ],
    note: 'You will not get another alert for this IP + signal until the cooldown expires.'
  };

  const { html, text } = buildBrandedEmail({
    ...content,
    logoUrl: `${env.CLIENT_ORIGIN.replace(/\/$/, '')}/log.png`,
    siteUrl: env.CLIENT_ORIGIN.replace(/\/$/, '')
  });

  for (const to of recipients) {
    await sendEmail({ to, subject, text, html });
  }
}

async function dispatchAlert(params: {
  signal: SecuritySignal;
  ip: string;
  count: number;
  method: string;
  path: string;
  status: number;
}): Promise<void> {
  const cfg = SIGNAL_CONFIG[params.signal];
  const windowMin = Math.round(cfg.windowMs / 60000);
  const line = `[security-alert] ${cfg.label} ip=${params.ip} count=${params.count}/${windowMin}m last=${params.method} ${params.path} ${params.status}`;
  console.warn(line);

  await Promise.allSettled([
    sendAlertEmail(params),
    postWebhook(
      `**${cfg.label}**\nIP: \`${params.ip}\`\nCount: ${params.count} in ${windowMin}m\nLast: \`${params.method} ${params.path}\` → ${params.status}\nUTC: ${new Date().toISOString()}`
    )
  ]);
}

/**
 * Record a finished request for burst detection. Safe to call from `res.on('finish')`.
 * Non-blocking: alert delivery is fire-and-forget.
 */
export function recordSecuritySignal(params: {
  method: string;
  path: string;
  status: number;
  ip: string;
}): void {
  if (!alertsEnabled()) {
    return;
  }

  const signal = classifySecuritySignal(params.method, params.path, params.status);
  if (!signal) {
    return;
  }

  const ip = params.ip && params.ip !== '-' ? params.ip : 'unknown';
  const now = Date.now();
  pruneStale(now);

  const key = bucketKey(signal, ip);
  const cfg = SIGNAL_CONFIG[signal];
  const stamps = (windows.get(key) ?? []).filter((t) => now - t <= cfg.windowMs);
  stamps.push(now);
  windows.set(key, stamps);

  if (stamps.length < cfg.threshold) {
    return;
  }

  const lastAlert = cooldowns.get(key) ?? 0;
  if (now - lastAlert < cfg.cooldownMs) {
    return;
  }

  cooldowns.set(key, now);

  void dispatchAlert({
    signal,
    ip,
    count: stamps.length,
    method: params.method,
    path: params.path,
    status: params.status
  }).catch((err) => {
    console.error('[security-alert] dispatch failed', err);
  });
}
