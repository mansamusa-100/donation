import type { PayoutMethodType } from '@prisma/client';
import nodemailer from 'nodemailer';
import { hasAdminPanelAccess } from '../config/adminPermissions.js';
import { prisma } from './prisma.js';
import { env } from '../config/env.js';
import { buildPayoutDetailsEmailSection } from './payoutMethods.js';
import {
  buildBrandedEmail,
  type BrandedEmailContent,
  type EmailDetail
} from './emailLayout.js';

let transporter: nodemailer.Transporter | null = null;

function getResendFromAddress(): string {
  const f = env.RESEND_FROM?.trim();
  if (f) {
    return f;
  }
  return env.MAIL_FROM;
}

function emailConfigured(): boolean {
  return Boolean(env.RESEND_API_KEY?.trim() || env.SMTP_HOST?.trim());
}

function clientBaseUrl(): string {
  return env.CLIENT_ORIGIN.replace(/\/$/, '');
}

function logoUrl(): string {
  return `${clientBaseUrl()}/log.png`;
}

function brandedShell(partial: Omit<BrandedEmailContent, 'logoUrl' | 'siteUrl'>): BrandedEmailContent {
  return {
    ...partial,
    logoUrl: logoUrl(),
    siteUrl: clientBaseUrl()
  };
}

async function sendBrandedEmail(options: {
  to: string;
  subject: string;
  content: BrandedEmailContent;
}): Promise<boolean> {
  const { html, text } = buildBrandedEmail(options.content);
  return sendEmail({ to: options.to, subject: options.subject, text, html });
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
      html: options.html
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

function formatGmd(amount: number): string {
  return `D${amount.toLocaleString()}`;
}

function withdrawalAmountDetails(params: {
  requestedAmount: number;
  processingFeeAmount: number;
  netAmount: number;
}): EmailDetail[] {
  return [
    { label: 'Requested', value: formatGmd(params.requestedAmount) },
    { label: 'Processing fee (3%)', value: formatGmd(params.processingFeeAmount) },
    { label: 'Net payout', value: formatGmd(params.netAmount) }
  ];
}

function payoutCalloutLines(params: {
  payoutMethodType?: PayoutMethodType | null;
  payoutLabel?: string | null;
  payoutDetails?: unknown;
  payoutReference?: string | null;
  paidAt?: Date | null;
}): string[] {
  return buildPayoutDetailsEmailSection(params)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('---'));
}

type WithdrawalPayoutEmailFields = {
  payoutMethodType?: PayoutMethodType | null;
  payoutLabel?: string | null;
  payoutDetails?: unknown;
  payoutReference?: string | null;
  paidAt?: Date | null;
};

type PlatformBankAccountEmail = {
  label: string | null;
  accountName: string;
  bankName: string;
  accountNumber: string;
  swiftCode: string;
  bban: string;
};

function platformBankDetails(account: PlatformBankAccountEmail): EmailDetail[] {
  const rows: EmailDetail[] = [];
  if (account.label?.trim()) {
    rows.push({ label: 'Label', value: account.label.trim() });
  }
  rows.push(
    { label: 'Account name', value: account.accountName },
    { label: 'Bank', value: account.bankName },
    { label: 'Account number', value: account.accountNumber },
    { label: 'SWIFT', value: account.swiftCode },
    { label: 'BBAN', value: account.bban }
  );
  return rows;
}

export async function sendWelcomeEmail(params: { to: string; fullName: string }): Promise<void> {
  const explore = `${clientBaseUrl()}/explore`;
  const subject = 'Welcome to BarakahFund';
  try {
    await sendBrandedEmail({
      to: params.to,
      subject,
      content: brandedShell({
        preheader: 'Your account is ready — explore campaigns or start a fundraiser.',
        eyebrow: 'Welcome',
        title: 'You’re in. Let’s fund what matters.',
        greeting: `Hi ${params.fullName},`,
        paragraphs: [
          'Thanks for creating a BarakahFund account. You can explore live campaigns, donate with your mobile wallet, or start a fundraiser of your own.'
        ],
        ctas: [{ label: 'Browse campaigns', href: explore }]
      })
    });
  } catch (err) {
    console.error('[mail] sendWelcomeEmail', err);
  }
}

export async function sendAccountClosedEmail(params: {
  to: string;
  fullName: string;
}): Promise<void> {
  const subject = 'Your BarakahFund account was closed';
  try {
    await sendBrandedEmail({
      to: params.to,
      subject,
      content: brandedShell({
        preheader: 'Confirmation that your account has been closed.',
        eyebrow: 'Account',
        title: 'Your account has been closed',
        greeting: `Hi ${params.fullName},`,
        paragraphs: [
          'This confirms that your BarakahFund account has been closed as you requested.',
          'You will no longer be able to sign in with this account. Any live campaigns you created have been taken offline.',
          'Donation and payout records are kept for legal and financial compliance.'
        ],
        note: 'If you did not request this, contact support immediately.'
      })
    });
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
  const dashboard = `${clientBaseUrl()}/dashboard`;
  try {
    await sendBrandedEmail({
      to: params.to,
      subject,
      content: brandedShell({
        preheader: 'Your campaign was submitted and is pending review.',
        eyebrow: 'Campaign submitted',
        title: 'We’ve received your fundraiser',
        greeting: `Hi ${params.fullName},`,
        paragraphs: [
          `Your campaign “${params.campaignTitle}” was submitted successfully and is pending review by our team.`,
          'You’ll get another email when it is approved and visible to the public.'
        ],
        details: [
          { label: 'Campaign', value: params.campaignTitle },
          { label: 'Status', value: 'Pending review' }
        ],
        ctas: [{ label: 'Open dashboard', href: dashboard }]
      })
    });
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
  const details: EmailDetail[] = [
    { label: 'Campaign', value: params.campaignTitle },
    { label: 'Donation', value: formatGmd(params.amount) }
  ];
  if (params.platformTipAmount > 0) {
    details.push({
      label: 'Platform support',
      value: formatGmd(params.platformTipAmount)
    });
  }
  try {
    await sendBrandedEmail({
      to: params.to,
      subject,
      content: brandedShell({
        preheader: `Your ${formatGmd(params.amount)} gift to ${params.campaignTitle} was received.`,
        eyebrow: 'Donation received',
        title: 'Thank you for your generosity',
        greeting: `Hi ${params.donorName},`,
        paragraphs: [
          `Your gift to “${params.campaignTitle}” has been recorded. Communities grow because people like you show up.`
        ],
        highlight: {
          label: 'Amount to campaign',
          value: formatGmd(params.amount),
          sublabel: params.platformTipAmount > 0
            ? `Plus ${formatGmd(params.platformTipAmount)} voluntary platform support`
            : undefined
        },
        details,
        ctas: [{ label: 'View campaign', href: url }]
      })
    });
  } catch (err) {
    console.error('[mail] sendDonationThankYouEmail', err);
  }
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
  const statusUrl = `${clientBaseUrl()}/track-bank-transfer?ref=${encodeURIComponent(params.clientReference)}`;
  const pendingUrl = `${clientBaseUrl()}/payment/bank/pending?ref=${encodeURIComponent(params.clientReference)}`;
  const campaignUrl = `${clientBaseUrl()}/campaign/${params.campaignSlug}`;
  const expires = params.expiresAt.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  const subject = `[BarakahFund] Bank transfer instructions — ${params.clientReference}`;
  const details: EmailDetail[] = [
    { label: 'Campaign', value: params.campaignTitle },
    { label: 'Declared amount', value: formatGmd(params.declaredAmount) }
  ];
  if (params.platformTipAmount > 0) {
    details.push({
      label: 'Declared tip',
      value: formatGmd(params.platformTipAmount)
    });
  }
  details.push({ label: 'Complete by', value: expires });
  try {
    await sendBrandedEmail({
      to: params.to,
      subject,
      content: brandedShell({
        preheader: `Transfer reference ${params.clientReference} — put this in your bank remarks.`,
        eyebrow: 'Bank transfer',
        title: 'Complete your bank transfer',
        greeting: `Hi ${params.donorName},`,
        paragraphs: [
          `You started a bank transfer for “${params.campaignTitle}”. Put the reference below in your transfer remarks exactly as shown.`,
          'Your donation is not counted on the campaign until our team confirms the payment. We credit the amount we actually receive.'
        ],
        highlight: {
          label: 'Payment reference',
          value: params.clientReference,
          sublabel: 'Required in transfer remarks / narration'
        },
        details,
        callouts: [
          {
            title: 'Transfer to this account',
            tone: 'accent',
            lines: platformBankDetails(params.platformBankAccount).map(
              (d) => `${d.label}: ${d.value}`
            )
          }
        ],
        ctas: [
          { label: 'Track transfer status', href: statusUrl },
          { label: 'View payment instructions', href: pendingUrl },
          { label: 'Open campaign', href: campaignUrl }
        ]
      })
    });
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
  const details: EmailDetail[] = [
    { label: 'Reference', value: params.clientReference },
    { label: 'Campaign', value: `${params.campaignTitle} (${params.campaignSlug})` },
    { label: 'Donor', value: params.donorName },
    { label: 'Email', value: params.donorEmail ?? '(guest / anonymous)' },
    { label: 'Declared amount', value: formatGmd(params.declaredAmount) }
  ];
  if (params.platformTipAmount > 0) {
    details.push({ label: 'Declared tip', value: formatGmd(params.platformTipAmount) });
  }
  details.push({ label: 'Expires', value: expires });

  for (const { email } of recipients) {
    try {
      await sendBrandedEmail({
        to: email,
        subject,
        content: brandedShell({
          preheader: `Confirm or reject bank transfer ${params.clientReference}.`,
          eyebrow: 'Admin · Bank',
          title: 'Bank transfer awaiting confirmation',
          paragraphs: [
            'A donor initiated a bank transfer. Verify the incoming payment, then confirm or reject in admin.'
          ],
          highlight: { label: 'Reference', value: params.clientReference },
          details,
          callouts: [
            {
              title: 'Receiving account',
              lines: platformBankDetails(params.platformBankAccount).map(
                (d) => `${d.label}: ${d.value}`
              )
            }
          ],
          ctas: [{ label: 'Open admin bank panel', href: adminUrl }]
        })
      });
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
  const statusUrl = `${clientBaseUrl()}/track-bank-transfer?ref=${encodeURIComponent(params.clientReference)}`;
  const subject = `[BarakahFund] Bank transfer not confirmed — ${params.clientReference}`;
  try {
    await sendBrandedEmail({
      to: params.to,
      subject,
      content: brandedShell({
        preheader: `We could not confirm transfer ${params.clientReference}.`,
        eyebrow: 'Bank transfer',
        title: 'Transfer not confirmed',
        greeting: `Hi ${params.donorName},`,
        paragraphs: [
          `We could not confirm your bank transfer for “${params.campaignTitle}”.`
        ],
        highlight: { label: 'Reference', value: params.clientReference },
        callouts: params.adminNote?.trim()
          ? [{ title: 'Note from our team', tone: 'danger', lines: [params.adminNote.trim()] }]
          : undefined,
        ctas: [{ label: 'View transfer status', href: statusUrl }],
        note: 'If you believe this is an error, reply to this email or contact support with your reference.'
      })
    });
  } catch (err) {
    console.error('[mail] sendBankTransferRejectedEmail', err);
  }
}

export async function sendBankTransferConfirmedEmail(params: {
  to: string;
  donorName: string;
  campaignTitle: string;
  campaignSlug: string;
  clientReference: string;
  confirmedAmount: number;
  platformTipAmount: number;
}): Promise<void> {
  const statusUrl = `${clientBaseUrl()}/track-bank-transfer?ref=${encodeURIComponent(params.clientReference)}`;
  const campaignUrl = `${clientBaseUrl()}/campaign/${params.campaignSlug}`;
  const subject = `[BarakahFund] Bank transfer confirmed — ${params.clientReference}`;
  const details: EmailDetail[] = [
    { label: 'Campaign', value: params.campaignTitle },
    { label: 'Reference', value: params.clientReference },
    { label: 'Credited to campaign', value: formatGmd(params.confirmedAmount) }
  ];
  if (params.platformTipAmount > 0) {
    details.push({ label: 'Platform tip', value: formatGmd(params.platformTipAmount) });
  }
  try {
    await sendBrandedEmail({
      to: params.to,
      subject,
      content: brandedShell({
        preheader: `Your bank transfer ${params.clientReference} was confirmed.`,
        eyebrow: 'Payment confirmed',
        title: 'Your bank transfer is confirmed',
        greeting: `Hi ${params.donorName},`,
        paragraphs: [
          `Great news — we confirmed your bank transfer for “${params.campaignTitle}”. Thank you for your support.`
        ],
        highlight: {
          label: 'Amount credited',
          value: formatGmd(params.confirmedAmount)
        },
        details,
        ctas: [
          { label: 'View campaign', href: campaignUrl },
          { label: 'View transfer status', href: statusUrl }
        ]
      })
    });
  } catch (err) {
    console.error('[mail] sendBankTransferConfirmedEmail', err);
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
  const payoutLines = payoutCalloutLines(params);
  try {
    await sendBrandedEmail({
      to: params.to,
      subject,
      content: brandedShell({
        preheader: `Withdrawal request received for ${params.campaignTitle}.`,
        eyebrow: 'Withdrawal',
        title: 'We’re processing your withdrawal request',
        greeting: `Hi ${params.fullName},`,
        paragraphs: [
          `We received your withdrawal request for “${params.campaignTitle}”. Our team will review it and pay out manually to the destination below.`,
          'You’ll receive another email when the status changes.'
        ],
        details: withdrawalAmountDetails(params),
        callouts: [
          ...(payoutLines.length
            ? [{ title: 'Payout destination', lines: payoutLines, tone: 'accent' as const }]
            : []),
          ...(params.organizerNote?.trim()
            ? [{ title: 'Your note', lines: [params.organizerNote.trim()] }]
            : [])
        ],
        ctas: [{ label: 'Open dashboard', href: dashboard }]
      })
    });
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
  const payoutLines = payoutCalloutLines(params);

  for (const { email } of recipients) {
    try {
      await sendBrandedEmail({
        to: email,
        subject,
        content: brandedShell({
          preheader: `Process withdrawal ${formatGmd(params.netAmount)} for ${params.campaignTitle}.`,
          eyebrow: 'Admin · Withdrawals',
          title: 'Withdrawal ready to process',
          paragraphs: [
            'A campaign organizer has requested a withdrawal. Process the payout manually using the details below.'
          ],
          highlight: {
            label: 'Net to pay',
            value: formatGmd(params.netAmount)
          },
          details: [
            { label: 'Campaign', value: `${params.campaignTitle} (${params.campaignSlug})` },
            { label: 'Request ID', value: params.withdrawalRequestId },
            { label: 'Organizer', value: params.organizerName },
            { label: 'Email', value: params.organizerEmail },
            ...(params.organizerPhone
              ? [{ label: 'Phone', value: params.organizerPhone }]
              : []),
            ...withdrawalAmountDetails(params)
          ],
          callouts: [
            ...(payoutLines.length
              ? [{ title: 'Payout destination', lines: payoutLines, tone: 'accent' as const }]
              : []),
            ...(params.organizerNote?.trim()
              ? [{ title: 'Organizer note', lines: [params.organizerNote.trim()] }]
              : [])
          ],
          ctas: [{ label: 'Open withdrawals', href: adminUrl }]
        })
      });
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
  try {
    await sendBrandedEmail({
      to: params.to,
      subject,
      content: brandedShell({
        preheader: 'Use this link within 1 hour to reset your password.',
        eyebrow: 'Security',
        title: 'Reset your password',
        greeting: `Hi ${params.fullName},`,
        paragraphs: [
          'We received a request to reset your password. Use the button below — the link is valid for 1 hour.',
          'If you did not ask for this, you can ignore this email. Your password will stay the same.'
        ],
        ctas: [{ label: 'Reset password', href: params.resetUrl }],
        note: `Or paste this link into your browser:\n${params.resetUrl}`
      })
    });
  } catch (err) {
    console.error('[mail] sendPasswordResetEmail', err);
  }
}

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

  for (const { email } of admins) {
    try {
      await sendBrandedEmail({
        to: email,
        subject,
        content: brandedShell({
          preheader: `Review campaign: ${params.title}`,
          eyebrow: 'Admin · Review queue',
          title: 'New campaign pending review',
          paragraphs: ['A new campaign has been submitted and needs your review.'],
          details: [
            { label: 'Title', value: params.title },
            { label: 'Creator', value: params.creatorLabel },
            { label: 'Slug', value: params.slug }
          ],
          ctas: [{ label: 'Open admin panel', href: adminUrl }]
        })
      });
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

  let title: string;
  let paragraphs: string[];
  let ctas: BrandedEmailContent['ctas'];
  let eyebrow = 'Campaign update';

  if (params.status === 'Active') {
    eyebrow = 'Approved';
    title = 'Your campaign is live';
    paragraphs = [
      `Good news — your campaign “${params.title}” has been approved and is now visible to donors.`
    ];
    ctas = [{ label: 'View public page', href: publicUrl }];
  } else if (params.status === 'Rejected') {
    title = 'Campaign not approved';
    paragraphs = [
      `Your campaign “${params.title}” was not approved at this time.`,
      'If you have questions, reply to this message or contact support.'
    ];
  } else {
    title = 'Campaign closed';
    paragraphs = [`Your campaign “${params.title}” has been closed by an administrator.`];
  }

  try {
    await sendBrandedEmail({
      to: params.to,
      subject,
      content: brandedShell({
        preheader: subject.replace('[BarakahFund] ', ''),
        eyebrow,
        title,
        paragraphs,
        details: [{ label: 'Campaign', value: params.title }],
        ctas
      })
    });
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

  const title =
    params.status === 'Paid'
      ? 'Payment complete'
      : params.status === 'Approved'
        ? 'Withdrawal approved'
        : 'Withdrawal not approved';

  const payoutLines = payoutCalloutLines(params);

  try {
    await sendBrandedEmail({
      to: params.to,
      subject,
      content: brandedShell({
        preheader: statusMessage,
        eyebrow: 'Withdrawal',
        title,
        greeting,
        paragraphs: [statusMessage],
        highlight:
          params.status === 'Paid' || params.status === 'Approved'
            ? { label: 'Net amount', value: formatGmd(params.netAmount) }
            : undefined,
        details: [
          { label: 'Campaign', value: params.campaignTitle },
          ...withdrawalAmountDetails(params)
        ],
        callouts: [
          ...(payoutLines.length
            ? [{ title: 'Payout destination', lines: payoutLines, tone: 'accent' as const }]
            : []),
          ...(params.organizerNote?.trim()
            ? [{ title: 'Your note', lines: [params.organizerNote.trim()] }]
            : []),
          ...(params.adminNote?.trim() && params.status !== 'Approved'
            ? [
                {
                  title: 'Message from our team',
                  lines: [params.adminNote.trim()],
                  tone: 'danger' as const
                }
              ]
            : [])
        ],
        ctas: [{ label: 'Open dashboard', href: dashboard }]
      })
    });
  } catch (err) {
    console.error('[mail] Failed to notify organizer about withdrawal', err);
  }
}
