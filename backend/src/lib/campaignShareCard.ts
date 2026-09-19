import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { uploadsFsPathFromPublicUrl, getUploadsRoot } from './uploadPaths.js';

const WIDTH = 1200;
const HEIGHT = 630;
const PHOTO_WIDTH = 520;

export type CampaignShareCardInput = {
  title: string;
  creatorName: string;
  coverImage: string;
  raisedAmount: number;
  goalAmount: number;
};

type CacheEntry = { body: Buffer; contentType: string; createdAt: number };

const memoryCache = new Map<string, CacheEntry>();
const CACHE_MAX = 80;

let fontCssCache: string | null = null;
let logoPngCache: Buffer | null | undefined;

function moduleDir(): string {
  return path.dirname(fileURLToPath(import.meta.url));
}

function resolveAsset(...parts: string[]): string | null {
  const candidates = [
    path.resolve(process.cwd(), 'assets', ...parts),
    path.resolve(process.cwd(), '..', 'assets', ...parts),
    path.resolve(moduleDir(), '..', '..', 'assets', ...parts),
    path.resolve(moduleDir(), '..', '..', '..', 'assets', ...parts)
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function resolveFontFile(fileName: string): string | null {
  const fromAssets = resolveAsset('fonts', fileName);
  if (fromAssets) {
    return fromAssets;
  }
  const npmCandidates = [
    path.resolve(process.cwd(), 'node_modules', 'dejavu-fonts-ttf', 'ttf', fileName),
    path.resolve(process.cwd(), '..', 'node_modules', 'dejavu-fonts-ttf', 'ttf', fileName),
    path.resolve(moduleDir(), '..', '..', '..', 'node_modules', 'dejavu-fonts-ttf', 'ttf', fileName),
    `/usr/share/fonts/truetype/dejavu/${fileName}`
  ];
  for (const candidate of npmCandidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function getFontSetup(): { css: string; family: string } {
  const systemRegular = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
  const systemBold = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
  if (fs.existsSync(systemRegular) && fs.existsSync(systemBold)) {
    // System fonts — no base64 payload (much faster for WhatsApp crawlers).
    return { css: '', family: 'DejaVu Sans' };
  }

  if (fontCssCache) {
    return { css: fontCssCache, family: 'CardSans' };
  }

  const regularPath = resolveFontFile('DejaVuSans.ttf');
  const boldPath = resolveFontFile('DejaVuSans-Bold.ttf');
  if (!regularPath || !boldPath) {
    console.warn('[share-card] DejaVu fonts missing — text may not render on this host');
    return { css: '', family: 'DejaVu Sans, Arial, sans-serif' };
  }
  const regular = fs.readFileSync(regularPath).toString('base64');
  const bold = fs.readFileSync(boldPath).toString('base64');
  fontCssCache = `
    @font-face {
      font-family: 'CardSans';
      src: url('data:font/ttf;base64,${regular}') format('truetype');
      font-weight: 400;
      font-style: normal;
    }
    @font-face {
      font-family: 'CardSans';
      src: url('data:font/ttf;base64,${bold}') format('truetype');
      font-weight: 700;
      font-style: normal;
    }
  `;
  return { css: fontCssCache, family: 'CardSans' };
}

function loadBrandLogoPng(): Buffer | null {
  if (logoPngCache !== undefined) {
    return logoPngCache;
  }
  const candidates = [
    resolveAsset('brand', 'log.png'),
    path.resolve(process.cwd(), '..', 'frontend', 'public', 'log.png'),
    path.resolve(process.cwd(), 'frontend', 'public', 'log.png'),
    path.resolve(getUploadsRoot(), '..', '..', 'frontend', 'public', 'log.png'),
    path.resolve(process.cwd(), '..', 'frontend', 'dist', 'log.png')
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      logoPngCache = fs.readFileSync(candidate);
      return logoPngCache;
    }
  }
  logoPngCache = null;
  return null;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapTitle(title: string, maxCharsPerLine: number, maxLines: number): string[] {
  const words = title.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxCharsPerLine) {
      current = next;
      continue;
    }
    if (current) {
      lines.push(current);
    }
    current = word.length > maxCharsPerLine ? `${word.slice(0, maxCharsPerLine - 1)}…` : word;
    if (lines.length >= maxLines - 1) {
      break;
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(current);
  }
  if (words.join(' ').length > lines.join(' ').length && lines.length > 0) {
    const last = lines[lines.length - 1];
    if (!last.endsWith('…')) {
      lines[lines.length - 1] = `${last.slice(0, Math.max(1, last.length - 1)).trimEnd()}…`;
    }
  }
  return lines.length > 0 ? lines : ['Campaign'];
}

function formatRaised(amount: number): string {
  const n = Math.round(amount);
  return `D${n.toLocaleString('en-US')} raised`;
}

function resolveLocalMediaPath(coverImage: string): string | null {
  const trimmed = coverImage.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith('/uploads/')) {
    return uploadsFsPathFromPublicUrl(trimmed);
  }
  if (path.isAbsolute(trimmed) && trimmed.includes(`${path.sep}uploads${path.sep}`)) {
    return trimmed;
  }
  return null;
}

async function loadCoverBuffer(coverImage: string): Promise<Buffer | null> {
  const local = resolveLocalMediaPath(coverImage);
  if (local && fs.existsSync(local)) {
    return fs.readFileSync(local);
  }
  if (coverImage.startsWith('http://') || coverImage.startsWith('https://')) {
    try {
      const res = await fetch(coverImage, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) {
        return null;
      }
      return Buffer.from(await res.arrayBuffer());
    } catch {
      return null;
    }
  }
  return null;
}

function cacheGet(key: string): CacheEntry | null {
  const hit = memoryCache.get(key);
  if (!hit) {
    return null;
  }
  // Refresh LRU order
  memoryCache.delete(key);
  memoryCache.set(key, hit);
  return hit;
}

function cacheSet(key: string, entry: CacheEntry): void {
  if (memoryCache.size >= CACHE_MAX) {
    const oldest = memoryCache.keys().next().value;
    if (oldest) {
      memoryCache.delete(oldest);
    }
  }
  memoryCache.set(key, entry);
}

export function shareCardCacheKey(input: CampaignShareCardInput & { updatedAtMs: number }): string {
  return [
    input.title,
    input.creatorName,
    input.coverImage,
    Math.round(input.raisedAmount),
    input.goalAmount,
    input.updatedAtMs
  ].join('|');
}

/**
 * Renders a 1200×630 Open Graph share card as JPEG (smaller / faster for WhatsApp).
 * Fonts are embedded as base64 so Linux containers render text reliably.
 */
export async function renderCampaignShareCard(input: CampaignShareCardInput): Promise<Buffer> {
  const progressPct = Math.min(
    100,
    Math.max(0, Math.round((input.raisedAmount / Math.max(1, input.goalAmount)) * 100))
  );
  const { css: fontCss, family: fontFamily } = getFontSetup();
  const titleLines = wrapTitle(input.title, 26, 3);
  const raisedLabel = formatRaised(input.raisedAmount);
  const organizer = input.creatorName.replace(/\s+/g, ' ').trim() || 'Organizer';

  const coverBuf = await loadCoverBuffer(input.coverImage);
  let photoLayer: Buffer;
  if (coverBuf) {
    photoLayer = await sharp(coverBuf)
      .rotate()
      .resize(PHOTO_WIDTH, HEIGHT, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
  } else {
    photoLayer = await sharp({
      create: {
        width: PHOTO_WIDTH,
        height: HEIGHT,
        channels: 3,
        background: { r: 5, g: 150, b: 105 }
      }
    })
      .jpeg({ quality: 82 })
      .toBuffer();
  }

  const logoRaw = loadBrandLogoPng();
  let logoLayer: { input: Buffer; top: number; left: number } | null = null;
  if (logoRaw) {
    const logo = await sharp(logoRaw).resize(56, 56, { fit: 'contain' }).png().toBuffer();
    logoLayer = { input: logo, top: 48, left: 56 };
  }

  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const dash = (progressPct / 100) * circumference;
  const raisedPillWidth = Math.min(360, Math.max(180, 56 + raisedLabel.length * 13));

  const titleTspans = titleLines
    .map((line, i) => {
      const dy = i === 0 ? 0 : 50;
      return `<tspan x="56" dy="${dy}">${escapeXml(line)}</tspan>`;
    })
    .join('');

  const titleY = logoLayer ? 158 : 148;
  const metaY = titleY + titleLines.length * 50;

  const overlaySvg = Buffer.from(
    `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <style type="text/css"><![CDATA[
          ${fontCss}
          .t { font-family: '${fontFamily}', sans-serif; }
        ]]></style>
        <linearGradient id="fade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="1"/>
          <stop offset="65%" stop-color="#ffffff" stop-opacity="1"/>
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <rect width="${WIDTH - PHOTO_WIDTH + 48}" height="${HEIGHT}" fill="#ffffff"/>
      <rect x="${WIDTH - PHOTO_WIDTH - 90}" width="130" height="${HEIGHT}" fill="url(#fade)"/>

      ${logoLayer ? '' : `<circle cx="84" cy="76" r="28" fill="#059669"/>`}

      <text class="t" x="56" y="${titleY}" font-size="42" font-weight="700" fill="#0f172a">${titleTspans}</text>

      <text class="t" x="56" y="${metaY + 28}" font-size="20" font-weight="400" fill="#94a3b8">Organized by</text>
      <text class="t" x="56" y="${metaY + 60}" font-size="24" font-weight="700" fill="#475569">${escapeXml(organizer)}</text>

      <g transform="translate(${WIDTH - PHOTO_WIDTH - 40}, ${HEIGHT - 170})">
        <circle cx="54" cy="54" r="54" fill="#ffffff"/>
        <circle cx="54" cy="54" r="${radius}" fill="none" stroke="#e2e8f0" stroke-width="10"/>
        <circle cx="54" cy="54" r="${radius}" fill="none" stroke="#059669" stroke-width="10"
          stroke-linecap="round"
          stroke-dasharray="${dash.toFixed(2)} ${circumference.toFixed(2)}"
          transform="rotate(-90 54 54)"/>
        <text class="t" x="54" y="63" text-anchor="middle" font-size="26" font-weight="700" fill="#0f172a">${progressPct}%</text>

        <rect x="128" y="16" rx="22" ry="22" width="${raisedPillWidth}" height="44" fill="#059669"/>
        <text class="t" x="148" y="46" font-size="20" font-weight="700" fill="#ffffff">${escapeXml(raisedLabel)}</text>

        <rect x="128" y="70" rx="22" ry="22" width="200" height="44" fill="#0f766e"/>
        <text class="t" x="148" y="100" font-size="20" font-weight="700" fill="#ffffff">Donate now</text>
      </g>

      <text class="t" x="56" y="${HEIGHT - 36}" font-size="18" font-weight="700" fill="#059669">BarakahFund</text>
    </svg>`
  );

  return sharp({
    create: {
      width: WIDTH,
      height: HEIGHT,
      channels: 3,
      background: { r: 255, g: 255, b: 255 }
    }
  })
    .composite([
      { input: photoLayer, top: 0, left: WIDTH - PHOTO_WIDTH },
      { input: overlaySvg, top: 0, left: 0 },
      ...(logoLayer ? [logoLayer] : [])
    ])
    .jpeg({ quality: 82, mozjpeg: true, chromaSubsampling: '4:2:0' })
    .toBuffer();
}

/** Cached render used by the HTTP handler (fast repeat WhatsApp crawls). */
export async function renderCampaignShareCardCached(
  input: CampaignShareCardInput & { updatedAtMs: number }
): Promise<{ body: Buffer; contentType: string }> {
  const key = shareCardCacheKey(input);
  const hit = cacheGet(key);
  if (hit) {
    return { body: hit.body, contentType: hit.contentType };
  }
  const body = await renderCampaignShareCard(input);
  const contentType = 'image/jpeg';
  cacheSet(key, { body, contentType, createdAt: Date.now() });
  return { body, contentType };
}

export const SHARE_CARD_WIDTH = WIDTH;
export const SHARE_CARD_HEIGHT = HEIGHT;
export const SHARE_CARD_CONTENT_TYPE = 'image/jpeg';
