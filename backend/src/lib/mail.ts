import nodemailer from 'nodemailer';
import { prisma } from './prisma.js';
import { env } from '../config/env.js';

let transporter: nodemailer.Transporter | null = null;

function getResendFromAddress(): string {
  const f = env.RESEND_FROM?.trim();
  if (f) {
    return f;
  }
  return env.MAIL_FROM;
}

function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<!DOCTYPE html><html><body style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#1a1a1a;max-width:560px;">
${escaped
  .split('\n\n')
  .map((p) => `<p style="margin:0 0 1em;">${p.replace(/\n/g, '<br/>')}</p>`)
  .join('')}
<p style="color:#666;font-size:12px;margin-top:2em;">— BarakahFund</p>
</body></html>`;
}

function emailConfigured(): boolean {
  return Boolean(env.RESEND_API_KEY?.trim() || env.SMTP_HOST?.trim());
}

async function sendWithResend(options: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<void> {
  const key = env.RESEND_API_KEY?.trim();
  if (!key) {
    throw new Error('Resend not configured');
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: getResendFromAddress(),
      to: [options.to],
      subject: options.subject,
      text: options.text,
      html: options.html ?? textToHtml(options.text)
    })
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Resend error ${res.status}: ${errBody || res.statusText}`);
  }
}

function getSmtpTransporter(): nodemailer.Transporter | null {
  if (!env.SMTP_HOST?.trim()) {
    return null;
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST.trim(),
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth:
        env.SMTP_USER && env.SMTP_PASS
          ? {
              user: env.SMTP_USER,
              pass: env.SMTP_PASS
            }
          : undefined
    });
  }
  return transporter;
}

/**
 * Core send: prefers Resend when `RESEND_API_KEY` is set, otherwise Nodemailer/SMTP.
 */
export async function sendEmail(options: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<boolean> {
  if (!emailConfigured()) {
    console.warn('[mail] No RESEND_API_KEY or SMTP_HOST — skipping email:', options.subject);
    return false;
  }
  if (env.RESEND_API_KEY?.trim()) {
    await sendWithResend(options);
    return true;
  }
  const transport = getSmtpTransporter();
  if (!transport) {
    console.warn('[mail] No transporter — skipping email:', options.subject);
    return false;
  }
  await transport.sendMail({
    from: env.MAIL_FROM,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html
  });
  return true;
}

function clientBaseUrl(): string {
  return env.CLIENT_ORIGIN.replace(/\/$/, '');
}

// --- Transactional templates ---

export async function sendWelcomeEmail(params: { to: string; fullName: string }): Promise<void> {
  const explore = `${clientBaseUrl()}/explore`;
  const subject = 'Welcome to BarakahFund';
  const text = [
    `Hi ${params.fullName},`,
    '',
    'Thanks for creating an account. You can explore live campaigns, donate with your mobile wallet, or start a fundraiser of your own.',
    '',
    `Browse campaigns: ${explore}`,
    '',
    '— BarakahFund'
  ].join('\n');
  try {
    await sendEmail({ to: params.to, subject, text });
  } catch (err) {
    console.error('[mail] sendWelcomeEmail', err);
  }
}

export async function sendCampaignCreatedConfirmation(params: {
  to: string;
  fullName: string;
  campaignTitle: string;
  campaignSlug: string;
}): Promise<void> {
  const subject = `[BarakahFund] We received your campaign: ${params.campaignTitle}`;
  const text = [
    `Hi ${params.fullName},`,
    '',
    `Your campaign "${params.campaignTitle}" was submitted successfully and is pending review by our team.`,
    "You'll get another email when it is approved and visible to the public.",
    '',
    'Thank you for helping your community on BarakahFund.',
    '',
    '— BarakahFund'
  ].join('\n');
  try {
    await sendEmail({ to: params.to, subject, text });
  } catch (err) {
    console.error('[mail] sendCampaignCreatedConfirmation', err);
  }
}

export async function sendDonationThankYouEmail(params: {
  to: string;
  donorName: string;
  amount: number;
  currency: string;
  campaignTitle: string;
  campaignSlug: string;
  platformTipAmount: number;
}): Promise<void> {
  const url = `${clientBaseUrl()}/campaign/${params.campaignSlug}`;
  const subject = `Thank you for supporting ${params.campaignTitle}`;
  const tipLine =
    params.platformTipAmount > 0
      ? `\nVoluntary support to BarakahFund: D${params.platformTipAmount.toLocaleString()} (thank you!)\n`
      : '\n';
  const text = [
    `Hi ${params.donorName},`,
    '',
    `Thank you for your ${params.currency} D${params.amount.toLocaleString()} gift to "${params.campaignTitle}".${tipLine}`,
    `View the campaign: ${url}`,
    '',
    'With gratitude,',
    'BarakahFund'
  ].join('\n');
  try {
    await sendEmail({ to: params.to, subject, text });
  } catch (err) {
    console.error('[mail] sendDonationThankYouEmail', err);
  }
}

export async function sendWithdrawalRequestReceivedEmail(params: {
  to: string;
  fullName: string;
  campaignTitle: string;
  requestedAmount: number;
  netAmount: number;
  processingFeeAmount: number;
}): Promise<void> {
  const subject = `[BarakahFund] We’re processing your withdrawal request — ${params.campaignTitle}`;
  const text = [
    `Hi ${params.fullName},`,
    '',
    `We received your withdrawal request for the campaign "${params.campaignTitle}".`,
    '',
    `Requested: D${params.requestedAmount.toLocaleString()}`,
    `Processing fee (3%): D${params.processingFeeAmount.toLocaleString()}`,
    `Estimated net: D${params.netAmount.toLocaleString()}`,
    '',
    'Our team will review it and you will get another email when the status changes.',
    '',
    '— BarakahFund'
  ].join('\n');
  try {
    await sendEmail({ to: params.to, subject, text });
  } catch (err) {
    console.error('[mail] sendWithdrawalRequestReceivedEmail', err);
  }
}

export async function sendPasswordResetEmail(params: {
  to: string;
  fullName: string;
  resetUrl: string;
}): Promise<void> {
  const subject = 'Reset your BarakahFund password';
  const text = [
    `Hi ${params.fullName},`,
    '',
    'We received a request to reset your password. Use the link below (valid for 1 hour). If you did not ask for this, you can ignore this email.',
    '',
    params.resetUrl,
    '',
    '— BarakahFund'
  ].join('\n');
  try {
    await sendEmail({ to: params.to, subject, text });
  } catch (err) {
    console.error('[mail] sendPasswordResetEmail', err);
  }
}

// --- Admin / existing notifications (unchanged behaviour, use sendEmail) ---

export async function notifyAdminsCampaignSubmitted(params: {
  title: string;
  slug: string;
  creatorLabel: string;
}): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN', isActive: true },
    select: { email: true }
  });
  const adminUrl = `${clientBaseUrl()}/admin`;
  const subject = `[BarakahFund] New campaign pending review: ${params.title}`;
  const text = [
    'A new campaign has been submitted and needs your review.',
    '',
    `Title: ${params.title}`,
    `Creator: ${params.creatorLabel}`,
    `Slug: ${params.slug}`,
    '',
    `Open the admin panel: ${adminUrl}`,
    '',
    '— BarakahFund'
  ].join('\n');

  for (const { email } of admins) {
    try {
      await sendEmail({ to: email, subject, text });
    } catch (err) {
      console.error('[mail] Failed to notify admin', email, err);
    }
  }
}

export async function notifyCreatorCampaignDecision(params: {
  to: string;
  title: string;
  slug: string;
  status: 'Active' | 'Rejected' | 'Closed';
}): Promise<void> {
  const publicUrl = `${clientBaseUrl()}/campaign/${params.slug}`;
  const subject =
    params.status === 'Active'
      ? `[BarakahFund] Your campaign is live: ${params.title}`
      : `[BarakahFund] Campaign update: ${params.title}`;

  let body: string;
  if (params.status === 'Active') {
    body = [
      `Good news — your campaign "${params.title}" has been approved and is now visible to donors.`,
      '',
      `View your public page: ${publicUrl}`,
      '',
      '— BarakahFund'
    ].join('\n');
  } else if (params.status === 'Rejected') {
    body = [
      `Your campaign "${params.title}" was not approved at this time.`,
      'If you have questions, reply to this message or contact support.',
      '',
      '— BarakahFund'
    ].join('\n');
  } else {
    body = [
      `Your campaign "${params.title}" has been closed by an administrator.`,
      '',
      '— BarakahFund'
    ].join('\n');
  }

  try {
    await sendEmail({ to: params.to, subject, text: body });
  } catch (err) {
    console.error('[mail] Failed to notify creator', err);
  }
}

export async function notifyCreatorWithdrawalStatus(params: {
  to: string;
  campaignTitle: string;
  requestedAmount: number;
  netAmount: number;
  processingFeeAmount: number;
  status: 'Approved' | 'Rejected' | 'Paid';
}): Promise<void> {
  const subject =
    params.status === 'Paid'
      ? `[BarakahFund] Payment complete — withdrawal for ${params.campaignTitle}`
      : params.status === 'Approved'
        ? `[BarakahFund] Withdrawal approved: ${params.campaignTitle}`
        : `[BarakahFund] Withdrawal update: ${params.campaignTitle}`;

  const body = [
    `Campaign: ${params.campaignTitle}`,
    `Requested: D${params.requestedAmount.toLocaleString()}`,
    `Processing fee (3%): D${params.processingFeeAmount.toLocaleString()}`,
    `Estimated net to you: D${params.netAmount.toLocaleString()}`,
    '',
    params.status === 'Paid'
      ? 'Success: your withdrawal has been marked as paid. Funds should reach you according to the payout method on file. Contact support if anything looks wrong.'
      : params.status === 'Approved'
        ? 'Your withdrawal request was approved. Payout will follow according to our schedule.'
        : 'Your withdrawal request was not approved. Contact support if you need clarification.',
    '',
    '— BarakahFund'
  ].join('\n');

  try {
    await sendEmail({ to: params.to, subject, text: body });
  } catch (err) {
    console.error('[mail] Failed to notify organizer about withdrawal', err);
  }
}
