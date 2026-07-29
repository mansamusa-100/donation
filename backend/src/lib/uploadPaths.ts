import path from 'path';
import { env } from '../config/env.js';

/** Absolute filesystem root for avatar/cover/verification uploads. */
export function getUploadsRoot(): string {
  const configured = env.UPLOADS_DIR.trim();
  if (configured) {
    return path.resolve(configured);
  }
  return path.resolve(process.cwd(), 'uploads');
}

/** Resolve a public `/uploads/...` URL to an absolute path under uploads root. Returns null if unsafe. */
export function uploadsFsPathFromPublicUrl(publicPath: string): string | null {
  if (!publicPath.startsWith('/uploads/')) {
    return null;
  }
  const rel = publicPath.slice('/uploads/'.length);
  if (!rel || rel.includes('..')) {
    return null;
  }
  const root = getUploadsRoot();
  const segments = rel.split('/').filter(Boolean);
  const resolved = path.resolve(root, ...segments);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }
  return resolved;
}
