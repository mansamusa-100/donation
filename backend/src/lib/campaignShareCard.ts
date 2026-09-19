import fs from 'fs';
import path from 'path';
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
  // Absolute filesystem path under uploads (unlikely from DB)
  if (path.isAbsolute(trimmed) && trimmed.includes(`${path.sep}uploads${path.sep}`)) {
    return trimmed;
  }
  return null;
}

function brandLogoPath(): string | null {
  const candidates = [
    path.resolve(process.cwd(), '..', 'frontend', 'public', 'log.png'),
    path.resolve(process.cwd(), 'frontend', 'public', 'log.png'),
    path.resolve(getUploadsRoot(), '..', '..', 'frontend', 'public', 'log.png')
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
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
      const res = await fetch(coverImage, { signal: AbortSignal.timeout(8000) });
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

/**
 * Renders a 1200×630 Open Graph share card: title + organizer on the left,
 * cover photo on the right, progress + raised + CTA overlaid (Barakah-branded).
 */
export async function renderCampaignShareCard(input: CampaignShareCardInput): Promise<Buffer> {
  const progressPct = Math.min(
    100,
    Math.max(0, Math.round((input.raisedAmount / Math.max(1, input.goalAmount)) * 100))
  );
  const titleLines = wrapTitle(input.title, 28, 3);
  const raisedLabel = formatRaised(input.raisedAmount);
  const organizer = input.creatorName.replace(/\s+/g, ' ').trim() || 'Organizer';

  const coverBuf = await loadCoverBuffer(input.coverImage);
  let photoLayer: Buffer;
  if (coverBuf) {
    photoLayer = await sharp(coverBuf)
      .rotate()
      .resize(PHOTO_WIDTH, HEIGHT, { fit: 'cover', position: 'centre' })
      .png()
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
      .png()
      .toBuffer();
  }

  const logoPath = brandLogoPath();
  let logoLayer: { input: Buffer; top: number; left: number } | null = null;
  if (logoPath) {
    const logo = await sharp(logoPath).resize(56, 56, { fit: 'contain' }).png().toBuffer();
    logoLayer = { input: logo, top: 48, left: 56 };
  }

  // Circular progress (r=46, circumference ≈ 289)
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const dash = (progressPct / 100) * circumference;

  const titleTspans = titleLines
    .map((line, i) => {
      const dy = i === 0 ? 0 : 52;
      return `<tspan x="56" dy="${dy}">${escapeXml(line)}</tspan>`;
    })
    .join('');

  const overlaySvg = Buffer.from(
    `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="fade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="1"/>
          <stop offset="70%" stop-color="#ffffff" stop-opacity="1"/>
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <rect width="${WIDTH - PHOTO_WIDTH + 40}" height="${HEIGHT}" fill="#ffffff"/>
      <rect x="${WIDTH - PHOTO_WIDTH - 80}" width="120" height="${HEIGHT}" fill="url(#fade)"/>

      ${logoLayer ? '' : `<circle cx="84" cy="76" r="28" fill="#059669"/>`}

      <text x="56" y="${logoLayer ? 160 : 150}" font-family="Segoe UI, Helvetica Neue, Arial, sans-serif" font-size="44" font-weight="700" fill="#0f172a">${titleTspans}</text>

      <text x="56" y="${160 + titleLines.length * 52 + 28}" font-family="Segoe UI, Helvetica Neue, Arial, sans-serif" font-size="22" fill="#94a3b8">Organized by</text>
      <text x="56" y="${160 + titleLines.length * 52 + 62}" font-family="Segoe UI, Helvetica Neue, Arial, sans-serif" font-size="26" font-weight="600" fill="#475569">${escapeXml(organizer)}</text>

      <!-- Progress cluster straddling the photo edge -->
      <g transform="translate(${WIDTH - PHOTO_WIDTH - 36}, ${HEIGHT - 168})">
        <circle cx="54" cy="54" r="54" fill="#ffffff"/>
        <circle cx="54" cy="54" r="${radius}" fill="none" stroke="#e2e8f0" stroke-width="10"/>
        <circle cx="54" cy="54" r="${radius}" fill="none" stroke="#059669" stroke-width="10"
          stroke-linecap="round"
          stroke-dasharray="${dash.toFixed(2)} ${circumference.toFixed(2)}"
          transform="rotate(-90 54 54)"/>
        <text x="54" y="62" text-anchor="middle" font-family="Segoe UI, Helvetica Neue, Arial, sans-serif" font-size="28" font-weight="700" fill="#0f172a">${progressPct}%</text>

        <rect x="128" y="18" rx="22" ry="22" width="${Math.min(340, 48 + raisedLabel.length * 14)}" height="44" fill="#059669"/>
        <text x="148" y="48" font-family="Segoe UI, Helvetica Neue, Arial, sans-serif" font-size="22" font-weight="700" fill="#ffffff">${escapeXml(raisedLabel)}</text>

        <rect x="128" y="72" rx="22" ry="22" width="188" height="44" fill="#0f766e"/>
        <text x="148" y="102" font-family="Segoe UI, Helvetica Neue, Arial, sans-serif" font-size="22" font-weight="700" fill="#ffffff">Donate now  →</text>
      </g>

      <text x="56" y="${HEIGHT - 36}" font-family="Segoe UI, Helvetica Neue, Arial, sans-serif" font-size="18" font-weight="600" fill="#059669">BarakahFund</text>
    </svg>`
  );

  const base = await sharp({
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
    .png({ compressionLevel: 8 })
    .toBuffer();

  return base;
}

export const SHARE_CARD_WIDTH = WIDTH;
export const SHARE_CARD_HEIGHT = HEIGHT;
