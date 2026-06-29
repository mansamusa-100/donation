import type { PayoutMethodType } from '@prisma/client';
import nodemailer from 'nodemailer';
import { hasAdminPanelAccess } from '../config/adminPermissions.js';
import { prisma } from './prisma.js';
import { env } from '../config/env.js';
import { buildPayoutDetailsEmailSection } from './payoutMethods.js';

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

function formatGmd(amount: number): string {
  return `D${amount.toLocaleString()}`;
}

function withdrawalAmountsBlock(params: {
  requestedAmount: number;
  processingFeeAmount: number;
  netAmount: number;
}): string {
  return [
    `Requested: ${formatGmd(params.requestedAmount)}`,
    `Processing fee (3%): ${formatGmd(params.processingFeeAmount)}`,
    `Net to you: ${formatGmd(params.netAmount)}`
  ].join('\n');
}

type WithdrawalPayoutEmailFields = {
  payoutMethodType?: PayoutMethodType | null;
  payoutLabel?: string | null;
  payoutDetails?: unknown;
  payoutReference?: string | null;
  paidAt?: Date | null;
};

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

export async function sendAccountClosedEmail(params: {
  to: string;
  fullName: string;
}): Promise<void> {
  const subject = 'Your BarakahFund account was closed';
  const text = [
    `Hi ${params.fullName},`,
    '',
    'This confirms that your BarakahFund account has been closed as you requested.',
    'You will no longer be able to sign in with this account.',
    'Any live campaigns you created have been taken offline. Donation and payout records are kept for legal and financial compliance.',
    '',
    'If you did not request this, contact support immediately.',
    '',
    '— BarakahFund'
  ].join('\n');
  try {
    await sendEmail({ to: params.to, subject, text });
  } catch (err) {
    console.error('[mail] sendAccountClosedEmail', err);
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

type PlatformBankAccountEmail = {
  label: string | null;
  accountName: string;
  bankName: string;
  accountNumber: string;
  swiftCode: string;
  bban: string;
};

function buildPlatformBankAccountBlock(account: PlatformBankAccountEmail): string {
  const labelLine = account.label?.trim() ? `Label: ${account.label.trim()}\n` : '';
  return [
    '--- Transfer to this account ---',
    labelLine,
    `Account name: ${account.accountName}`,
    `Bank: ${account.bankName}`,
    `Account number: ${account.accountNumber}`,
    `SWIFT: ${account.swiftCode}`,
    `BBAN: ${account.bban}`
  ]
    .filter(Boolean)
    .join('\n');
}

export async function sendBankTransferPendingEmail(params: {
  to: string;
  donorName: string;
  campaignTitle: string;
  campaignSlug: string;
  clientReference: string;
  declaredAmount: number;
  platformTipAmount: number;
  expiresAt: Date;
  platformBankAccount: PlatformBankAccountEmail;
}): Promise<void> {
  const statusUrl = `${clientBaseUrl()}/payment/bank/pending?ref=${encodeURIComponent(params.clientReference)}`;
  const campaignUrl = `${clientBaseUrl()}/campaign/${params.campaignSlug}`;
  const expires = params.expiresAt.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  const subject = `[BarakahFund] Bank transfer instructions — ${params.clientReference}`;
  const text = [
    `Hi ${params.donorName},`,
    '',
    `You started a bank transfer for "${params.campaignTitle}".`,
    '',
    `Reference (put this in your transfer remarks): ${params.clientReference}`,
    `Declared campaign amount: ${formatGmd(params.declaredAmount)}`,
    params.platformTipAmount > 0
      ? `Declared platform tip (recorded when we confirm): ${formatGmd(params.platformTipAmount)}`
      : '',
    `Complete your transfer by: ${expires}`,
    '',
    buildPlatformBankAccountBlock(params.platformBankAccount),
    '',
    'Your donation is not counted on the campaign until our team confirms the payment. The amount we credit may differ if you sent a different amount — we use what we receive.',
    '',
    `Track status: ${statusUrl}`,
    `Campaign: ${campaignUrl}`,
    '',
    '— BarakahFund'
  ]
    .filter(Boolean)
    .join('\n');
  try {
    await sendEmail({ to: params.to, subject, text });
  } catch (err) {
    console.error('[mail] sendBankTransferPendingEmail', err);
  }
}

export async function notifyAdminsBankTransferPending(params: {
  clientReference: string;
  campaignTitle: string;
  campaignSlug: string;
  donorName: string;
  donorEmail: string | null;
  declaredAmount: number;
  platformTipAmount: number;
  expiresAt: Date;
  platformBankAccount: PlatformBankAccountEmail;
}): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN', isActive: true },
    select: { email: true, adminPanelPermissions: true }
  });
  const recipients = admins.filter((a) =>
    hasAdminPanelAccess('ADMIN', a.adminPanelPermissions, 'bank')
  );
  if (recipients.length === 0) {
    return;
  }
  const adminUrl = `${clientBaseUrl()}/admin`;
  const expires = params.expiresAt.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  const subject = `[BarakahFund] Bank transfer pending: ${params.clientReference} — ${params.campaignTitle}`;
  const text = [
    'A donor initiated a bank transfer. Verify the incoming payment and confirm or reject in admin.',
    '',
    `Reference: ${params.clientReference}`,
    `Campaign: ${params.campaignTitle} (${params.campaignSlug})`,
    `Donor: ${params.donorName}`,
    params.donorEmail ? `Email: ${params.donorEmail}` : 'Email: (guest / anonymous)',
    `Declared amount: ${formatGmd(params.declaredAmount)}`,
    params.platformTipAmount > 0 ? `Declared tip: ${formatGmd(params.platformTipAmount)}` : '',
    `Expires: ${expires}`,
    '',
    buildPlatformBankAccountBlock(params.platformBankAccount),
    '',
    `Open bank transfers: ${adminUrl}`,
    '',
    '— BarakahFund'
  ]
    .filter(Boolean)
    .join('\n');
  for (const { email } of recipients) {
    try {
      await sendEmail({ to: email, subject, text });
    } catch (err) {
      console.error('[mail] notifyAdminsBankTransferPending', email, err);
    }
  }
}

export async function sendBankTransferRejectedEmail(params: {
  to: string;
  donorName: string;
  campaignTitle: string;
  clientReference: string;
  adminNote?: string | null;
}): Promise<void> {
  const subject = `[BarakahFund] Bank transfer not confirmed — ${params.clientReference}`;
  const text = [
    `Hi ${params.donorName},`,
    '',
    `We could not confirm your bank transfer (${params.clientReference}) for "${params.campaignTitle}".`,
    params.adminNote?.trim() ? `Note from our team: ${params.adminNote.trim()}` : '',
    '',
    'If you believe this is an error, reply to this email or contact support with your reference.',
    '',
    '— BarakahFund'
  ]
    .filter(Boolean)
    .join('\n');
  try {
    await sendEmail({ to: params.to, subject, text });
  } catch (err) {
    console.error('[mail] sendBankTransferRejectedEmail', err);
  }
}

export async function sendWithdrawalRequestReceivedEmail(params: {
  to: string;
  fullName: string;
  campaignTitle: string;
  campaignSlug: string;
  requestedAmount: number;
  netAmount: number;
  processingFeeAmount: number;
  currency?: string;
  organizerNote?: string | null;
} & WithdrawalPayoutEmailFields): Promise<void> {
  const dashboard = `${clientBaseUrl()}/dashboard`;
  const subject = `[BarakahFund] We’re processing your withdrawal request — ${params.campaignTitle}`;
  const text = [
    `Hi ${params.fullName},`,
    '',
    `We received your withdrawal request for the campaign "${params.campaignTitle}".`,
    '',
    withdrawalAmountsBlock(params),
    '',
    buildPayoutDetailsEmailSection(params),
    params.organizerNote?.trim()
      ? `Your note: ${params.organizerNote.trim()}\n`
      : '',
    'Our team will review your request and pay out manually to the destination above. You will receive another email when the status changes.',
    '',
    `Track requests: ${dashboard}`,
    '',
    '— BarakahFund'
  ].join('\n');
  try {
    await sendEmail({ to: params.to, subject, text });
  } catch (err) {
    console.error('[mail] sendWithdrawalRequestReceivedEmail', err);
  }
}

export async function notifyAdminsWithdrawalRequested(params: {
  campaignTitle: string;
  campaignSlug: string;
  organizerName: string;
  organizerEmail: string;
  organizerPhone?: string | null;
  requestedAmount: number;
  netAmount: number;
  processingFeeAmount: number;
  currency?: string;
  organizerNote?: string | null;
  withdrawalRequestId: string;
} & WithdrawalPayoutEmailFields): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN', isActive: true },
    select: { email: true, adminPanelPermissions: true }
  });

  const recipients = admins.filter((a) =>
    hasAdminPanelAccess('ADMIN', a.adminPanelPermissions, 'withdrawals')
  );

  if (recipients.length === 0) {
    return;
  }

  const adminUrl = `${clientBaseUrl()}/admin`;
  const subject = `[BarakahFund] Withdrawal to process: ${params.campaignTitle} — ${formatGmd(params.netAmount)} net`;
  const text = [
    'A campaign organizer has requested a withdrawal. Process the payout manually using the details below.',
    '',
    `Campaign: ${params.campaignTitle} (${params.campaignSlug})`,
    `Request ID: ${params.withdrawalRequestId}`,
    '',
    '--- Organizer ---',
    `Name: ${params.organizerName}`,
    `Email: ${params.organizerEmail}`,
    params.organizerPhone ? `Phone: ${params.organizerPhone}` : '',
    '',
    '--- Amounts ---',
    withdrawalAmountsBlock(params),
    '',
    buildPayoutDetailsEmailSection(params),
    params.organizerNote?.trim() ? `Organizer note: ${params.organizerNote.trim()}\n` : '',
    `Open withdrawals in admin: ${adminUrl}`,
    '',
    '— BarakahFund'
  ]
    .filter(Boolean)
    .join('\n');

  for (const { email } of recipients) {
    try {
      await sendEmail({ to: email, subject, text });
    } catch (err) {
      console.error('[mail] notifyAdminsWithdrawalRequested', email, err);
    }
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
  status: 'Active' | 'Rejected' | 'Closed' | 'Ended';
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
  fullName?: string;
  campaignTitle: string;
  requestedAmount: number;
  netAmount: number;
  processingFeeAmount: number;
  currency?: string;
  status: 'Approved' | 'Rejected' | 'Paid';
  adminNote?: string | null;
  organizerNote?: string | null;
} & WithdrawalPayoutEmailFields): Promise<void> {
  const greeting = params.fullName?.trim() ? `Hi ${params.fullName.trim()},` : 'Hi,';
  const dashboard = `${clientBaseUrl()}/dashboard`;

  const subject =
    params.status === 'Paid'
      ? `[BarakahFund] Payment complete — ${formatGmd(params.netAmount)} for ${params.campaignTitle}`
      : params.status === 'Approved'
        ? `[BarakahFund] Withdrawal approved: ${params.campaignTitle}`
        : `[BarakahFund] Withdrawal update: ${params.campaignTitle}`;

  const statusMessage =
    params.status === 'Paid'
      ? 'Your withdrawal has been marked as paid. Details of the payout are below. Contact support if anything looks wrong.'
      : params.status === 'Approved'
        ? 'Your withdrawal request was approved. Our team will send the net amount to the payout destination below.'
        : 'Your withdrawal request was not approved at this time.';

  const body = [
    greeting,
    '',
    `Campaign: ${params.campaignTitle}`,
    '',
    withdrawalAmountsBlock(params),
    '',
    buildPayoutDetailsEmailSection(params),
    params.organizerNote?.trim() ? `Your note: ${params.organizerNote.trim()}\n` : '',
    params.adminNote?.trim() && params.status !== 'Approved'
      ? `Message from our team: ${params.adminNote.trim()}\n`
      : '',
    statusMessage,
    '',
    `View your dashboard: ${dashboard}`,
    '',
    '— BarakahFund'
  ]
    .filter((line) => line !== undefined)
    .join('\n');

  try {
    await sendEmail({ to: params.to, subject, text: body });
  } catch (err) {
    console.error('[mail] Failed to notify organizer about withdrawal', err);
  }
}
