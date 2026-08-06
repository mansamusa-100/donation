/**
 * Shared HTML + plain-text email shell for BarakahFund transactional mail.
 * Table-based, inline CSS for Outlook/Gmail/Apple Mail.
 */

const BRAND = {
  name: 'BarakahFund',
  primary: '#059669',
  primaryDark: '#047857',
  ink: '#1c1917',
  muted: '#78716c',
  line: '#e7e5e4',
  soft: '#fafaf9',
  softGreen: '#ecfdf5',
  white: '#ffffff',
  danger: '#b91c1c'
} as const;

export type EmailDetail = { label: string; value: string };

export type EmailCallout = {
  title?: string;
  lines: string[];
  /** accent | muted | danger */
  tone?: 'accent' | 'muted' | 'danger';
};

export type EmailCta = { label: string; href: string };

export type BrandedEmailContent = {
  /** Inbox preview text (hidden in body). */
  preheader?: string;
  eyebrow?: string;
  title: string;
  greeting?: string;
  paragraphs?: string[];
  /** Large emphasis block (amount, reference, etc.). */
  highlight?: { label: string; value: string; sublabel?: string };
  details?: EmailDetail[];
  callouts?: EmailCallout[];
  ctas?: EmailCta[];
  note?: string;
  /** Absolute URL to logo PNG (optional). */
  logoUrl?: string;
  supportEmail?: string;
  siteUrl?: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function nl2br(value: string): string {
  return escapeHtml(value).replace(/\n/g, '<br/>');
}

function renderDetailsTable(details: EmailDetail[]): string {
  if (details.length === 0) {
    return '';
  }
  const rows = details
    .map(
      (d, i) => `
      <tr>
        <td style="padding:10px 0;border-top:${i === 0 ? 'none' : `1px solid ${BRAND.line}`};font-size:13px;color:${BRAND.muted};width:38%;vertical-align:top;">${escapeHtml(d.label)}</td>
        <td style="padding:10px 0;border-top:${i === 0 ? 'none' : `1px solid ${BRAND.line}`};font-size:14px;color:${BRAND.ink};font-weight:600;vertical-align:top;">${nl2br(d.value)}</td>
      </tr>`
    )
    .join('');
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:${BRAND.soft};border:1px solid ${BRAND.line};border-radius:12px;">
      <tr>
        <td style="padding:4px 18px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
        </td>
      </tr>
    </table>`;
}

function renderHighlight(h: NonNullable<BrandedEmailContent['highlight']>): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:${BRAND.softGreen};border:1px solid #a7f3d0;border-radius:12px;">
      <tr>
        <td style="padding:18px 20px;text-align:center;">
          <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND.primaryDark};font-weight:700;margin-bottom:6px;">${escapeHtml(h.label)}</div>
          <div style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:22px;line-height:1.3;font-weight:700;color:${BRAND.ink};word-break:break-all;">${escapeHtml(h.value)}</div>
          ${h.sublabel ? `<div style="margin-top:8px;font-size:13px;color:${BRAND.muted};">${escapeHtml(h.sublabel)}</div>` : ''}
        </td>
      </tr>
    </table>`;
}

function renderCallouts(callouts: EmailCallout[]): string {
  return callouts
    .map((c) => {
      const bg =
        c.tone === 'danger' ? '#fef2f2' : c.tone === 'accent' ? BRAND.softGreen : BRAND.soft;
      const border =
        c.tone === 'danger' ? '#fecaca' : c.tone === 'accent' ? '#a7f3d0' : BRAND.line;
      const titleColor =
        c.tone === 'danger' ? BRAND.danger : c.tone === 'accent' ? BRAND.primaryDark : BRAND.ink;
      const lines = c.lines.map((line) => `<div style="margin:0 0 4px;">${nl2br(line)}</div>`).join('');
      return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background:${bg};border:1px solid ${border};border-radius:12px;">
        <tr>
          <td style="padding:16px 18px;">
            ${c.title ? `<div style="font-size:13px;font-weight:700;color:${titleColor};margin:0 0 8px;">${escapeHtml(c.title)}</div>` : ''}
            <div style="font-size:14px;line-height:1.55;color:${BRAND.ink};">${lines}</div>
          </td>
        </tr>
      </table>`;
    })
    .join('');
}

function renderCtas(ctas: EmailCta[]): string {
  if (ctas.length === 0) {
    return '';
  }
  const [primary, ...rest] = ctas;
  const primaryBtn = primary
    ? `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 12px;">
      <tr>
        <td style="border-radius:10px;background:${BRAND.primary};">
          <a href="${escapeHtml(primary.href)}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:${BRAND.white};text-decoration:none;border-radius:10px;">${escapeHtml(primary.label)}</a>
        </td>
      </tr>
    </table>`
    : '';
  const secondary = rest
    .map(
      (c) =>
        `<div style="text-align:center;margin:0 0 8px;"><a href="${escapeHtml(c.href)}" style="font-size:14px;font-weight:600;color:${BRAND.primaryDark};text-decoration:underline;">${escapeHtml(c.label)}</a></div>`
    )
    .join('');
  return `<div style="margin:8px 0 28px;">${primaryBtn}${secondary}</div>`;
}

export function renderBrandedEmailHtml(content: BrandedEmailContent): string {
  const siteUrl = content.siteUrl?.replace(/\/$/, '') ?? '';
  const support = content.supportEmail?.trim() || 'support@contact.barakahfund.site';
  const paragraphs = (content.paragraphs ?? [])
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${BRAND.ink};">${nl2br(p)}</p>`
    )
    .join('');

  const logoBlock = content.logoUrl
    ? `<img src="${escapeHtml(content.logoUrl)}" width="40" height="40" alt="${BRAND.name}" style="display:block;border:0;border-radius:10px;margin:0 auto 12px;" />`
    : '';

  const preheader = content.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(content.preheader)}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>${escapeHtml(content.title)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.soft};color:${BRAND.ink};-webkit-text-size-adjust:100%;">
  ${preheader}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.soft};padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${BRAND.white};border:1px solid ${BRAND.line};border-radius:16px;overflow:hidden;">
          <tr>
            <td style="background:${BRAND.primary};padding:22px 28px;text-align:center;">
              ${logoBlock}
              <div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;letter-spacing:0.01em;color:${BRAND.white};">${BRAND.name}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 28px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              ${content.eyebrow ? `<div style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:${BRAND.primary};font-weight:700;margin:0 0 10px;">${escapeHtml(content.eyebrow)}</div>` : ''}
              <h1 style="margin:0 0 18px;font-size:22px;line-height:1.3;font-weight:700;color:${BRAND.ink};">${escapeHtml(content.title)}</h1>
              ${content.greeting ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${BRAND.ink};">${escapeHtml(content.greeting)}</p>` : ''}
              ${paragraphs}
              ${content.highlight ? renderHighlight(content.highlight) : ''}
              ${content.details?.length ? renderDetailsTable(content.details) : ''}
              ${content.callouts?.length ? renderCallouts(content.callouts) : ''}
              ${content.ctas?.length ? renderCtas(content.ctas) : ''}
              ${content.note ? `<p style="margin:0 0 8px;font-size:13px;line-height:1.55;color:${BRAND.muted};">${nl2br(content.note)}</p>` : ''}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 28px 28px;border-top:1px solid ${BRAND.line};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              <p style="margin:0 0 6px;font-size:12px;line-height:1.5;color:${BRAND.muted};">
                ${BRAND.name} — trusted fundraising for communities that need it.
              </p>
              <p style="margin:0;font-size:12px;line-height:1.5;color:${BRAND.muted};">
                Questions? <a href="mailto:${escapeHtml(support)}" style="color:${BRAND.primaryDark};text-decoration:underline;">${escapeHtml(support)}</a>
                ${siteUrl ? ` · <a href="${escapeHtml(siteUrl)}" style="color:${BRAND.primaryDark};text-decoration:underline;">Visit site</a>` : ''}
              </p>
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;font-size:11px;color:#a8a29e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
          You’re receiving this because of activity on ${BRAND.name}.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Build a readable plain-text body that mirrors the branded content. */
export function renderBrandedEmailText(content: BrandedEmailContent): string {
  const lines: string[] = [];
  if (content.greeting) {
    lines.push(content.greeting, '');
  }
  if (content.title) {
    lines.push(content.title, '');
  }
  for (const p of content.paragraphs ?? []) {
    lines.push(p, '');
  }
  if (content.highlight) {
    lines.push(`${content.highlight.label}: ${content.highlight.value}`);
    if (content.highlight.sublabel) {
      lines.push(content.highlight.sublabel);
    }
    lines.push('');
  }
  if (content.details?.length) {
    for (const d of content.details) {
      lines.push(`${d.label}: ${d.value}`);
    }
    lines.push('');
  }
  for (const c of content.callouts ?? []) {
    if (c.title) {
      lines.push(c.title);
    }
    lines.push(...c.lines, '');
  }
  for (const cta of content.ctas ?? []) {
    lines.push(`${cta.label}: ${cta.href}`);
  }
  if (content.ctas?.length) {
    lines.push('');
  }
  if (content.note) {
    lines.push(content.note, '');
  }
  lines.push(`— ${BRAND.name}`);
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

export function buildBrandedEmail(content: BrandedEmailContent): { html: string; text: string } {
  return {
    html: renderBrandedEmailHtml(content),
    text: renderBrandedEmailText(content)
  };
}
