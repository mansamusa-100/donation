import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'path';
import { randomBytes } from 'node:crypto';

const uploadsRoot = path.join(process.cwd(), 'uploads');

/** Max longest edge for campaign covers & gallery uploads (stored as WebP). */
export const CAMPAIGN_IMAGE_MAX_EDGE = 1920;
/** ID document photos: cap size while keeping text readable for admins. */
export const VERIFICATION_IMAGE_MAX_EDGE = 2048;

const CAMPAIGN_WEBP_QUALITY = 82;
const VERIFICATION_WEBP_QUALITY = 80;

/** Profile pictures: small centered square is plenty for avatars. */
const AVATAR_EDGE = 512;
const AVATAR_WEBP_QUALITY = 84;

function newWebpBasename() {
  return `${Date.now()}-${randomBytes(8).toString('hex')}.webp`;
}

/**
 * Resize, normalize orientation, and compress campaign imagery for faster loads (especially mobile).
 */
export async function writeCampaignCoverWebp(buffer: Buffer): Promise<{ relativeUrl: string }> {
  const dir = path.join(uploadsRoot, 'campaign-covers');
  await fs.mkdir(dir, { recursive: true });
  const filename = newWebpBasename();
  const outPath = path.join(dir, filename);

  await sharp(buffer, { failOn: 'none' })
    .rotate()
    .resize(CAMPAIGN_IMAGE_MAX_EDGE, CAMPAIGN_IMAGE_MAX_EDGE, {
      fit: 'inside',
      withoutEnlargement: true
    })
    .webp({ quality: CAMPAIGN_WEBP_QUALITY, effort: 4 })
    .toFile(outPath);

  return { relativeUrl: `/uploads/campaign-covers/${filename}` };
}

/**
 * Crop-and-resize a profile picture to a centered square WebP avatar.
 */
export async function writeProfileAvatarWebp(buffer: Buffer): Promise<{ relativeUrl: string }> {
  const dir = path.join(uploadsRoot, 'avatars');
  await fs.mkdir(dir, { recursive: true });
  const filename = newWebpBasename();
  const outPath = path.join(dir, filename);

  await sharp(buffer, { failOn: 'none' })
    .rotate()
    .resize(AVATAR_EDGE, AVATAR_EDGE, {
      fit: 'cover',
      position: 'attention',
      withoutEnlargement: false
    })
    .webp({ quality: AVATAR_WEBP_QUALITY, effort: 4 })
    .toFile(outPath);

  return { relativeUrl: `/uploads/avatars/${filename}` };
}

/**
 * Replace a temp verification-ID image on disk with a compressed WebP. PDFs are untouched (caller skips).
 */
export async function convertVerificationImageFileToWebp(absolutePath: string): Promise<{ relativeUrl: string }> {
  const dir = path.dirname(absolutePath);
  const filename = newWebpBasename();
  const outPath = path.join(dir, filename);

  await sharp(absolutePath, { failOn: 'none' })
    .rotate()
    .resize(VERIFICATION_IMAGE_MAX_EDGE, VERIFICATION_IMAGE_MAX_EDGE, {
      fit: 'inside',
      withoutEnlargement: true
    })
    .webp({ quality: VERIFICATION_WEBP_QUALITY, effort: 4 })
    .toFile(outPath);

  await fs.unlink(absolutePath).catch(() => {});

  return { relativeUrl: `/uploads/verification-ids/${filename}` };
}
