import fs from 'fs';
import { prisma } from './prisma.js';
import { env } from '../config/env.js';

const BRAND_NAME = 'BarakahFund';
const DEFAULT_DESCRIPTION =
  'Islamic crowdfunding for verified causes — donate securely and track impact.';

export function publicSiteOrigin(): string {
  const raw = (env.APP_PUBLIC_BASE_URL.trim() || env.CLIENT_ORIGIN.trim()).replace(/\/$/, '');
  return raw || 'http://localhost:5173';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}

function absolutizeMediaUrl(pathOrUrl: string | null | undefined, origin: string): string {
  const fallback = `${origin}/log.png`;
  if (!pathOrUrl?.trim()) {
    return fallback;
  }
  const value = pathOrUrl.trim();
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return value;
  }
  if (value.startsWith('/')) {
    return `${origin}${value}`;
  }
  return `${origin}/${value}`;
}

function truncate(text: string, max: number): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= max) {
    return cleaned;
  }
  return `${cleaned.slice(0, max - 1).trimEnd()}…`;
}

export type CampaignOgPayload = {
  title: string;
  description: string;
  url: string;
  imageUrl: string;
  siteName: string;
};

export function buildCampaignOgTags(meta: CampaignOgPayload): string {
  const title = escapeHtml(`${meta.title} · ${meta.siteName}`);
  const description = escapeAttr(meta.description);
  const url = escapeAttr(meta.url);
  const image = escapeAttr(meta.imageUrl);
  const siteName = escapeAttr(meta.siteName);
  const plainTitle = escapeAttr(meta.title);

  return [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${siteName}" />`,
    `<meta property="og:locale" content="en_US" />`,
    `<meta property="og:title" content="${plainTitle}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta property="og:image:alt" content="${plainTitle}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${plainTitle}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${image}" />`
  ].join('\n    ');
}

export function injectHeadTags(html: string, tagsHtml: string): string {
  let next = html
    .replace(/<title>[\s\S]*?<\/title>/gi, '')
    .replace(/<meta\s+name=["']description["'][^>]*>/gi, '')
    .replace(/<link\s+rel=["']canonical["'][^>]*>/gi, '')
    .replace(/<meta\s+property=["']og:[^"']+["'][^>]*>/gi, '')
    .replace(/<meta\s+name=["']twitter:[^"']+["'][^>]*>/gi, '');
  next = next.replace(/<\/head>/i, `    ${tagsHtml}\n  </head>`);
  return next;
}

export async function loadCampaignOgPayload(slug: string): Promise<CampaignOgPayload | null> {
  const campaign = await prisma.campaign.findUnique({
    where: { slug },
    select: {
      title: true,
      shortDescription: true,
      coverImage: true,
      slug: true,
      status: true
    }
  });

  if (!campaign || (campaign.status !== 'Active' && campaign.status !== 'Ended')) {
    return null;
  }

  const origin = publicSiteOrigin();
  return {
    title: campaign.title,
    description: truncate(campaign.shortDescription || DEFAULT_DESCRIPTION, 200),
    url: `${origin}/campaign/${campaign.slug}`,
    imageUrl: absolutizeMediaUrl(campaign.coverImage, origin),
    siteName: BRAND_NAME
  };
}

let cachedSpaIndex: { path: string; mtimeMs: number; html: string } | null = null;

export function readSpaIndexHtml(spaIndexPath: string): string | null {
  try {
    const stat = fs.statSync(spaIndexPath);
    if (cachedSpaIndex && cachedSpaIndex.path === spaIndexPath && cachedSpaIndex.mtimeMs === stat.mtimeMs) {
      return cachedSpaIndex.html;
    }
    const html = fs.readFileSync(spaIndexPath, 'utf8');
    cachedSpaIndex = { path: spaIndexPath, mtimeMs: stat.mtimeMs, html };
    return html;
  } catch {
    return null;
  }
}

/** Minimal HTML for crawlers when the Vite build is not on disk (local API-only). */
export function buildStandaloneOgHtml(meta: CampaignOgPayload): string {
  const tags = buildCampaignOgTags(meta);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ${tags}
  </head>
  <body>
    <p><a href="${escapeAttr(meta.url)}">${escapeHtml(meta.title)}</a></p>
    <p>${escapeHtml(meta.description)}</p>
  </body>
</html>`;
}
