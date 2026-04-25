import path from 'path';

/** Resolve a public `/uploads/...` URL to an absolute path under `uploads/`. Returns null if unsafe. */
export function uploadsFsPathFromPublicUrl(publicPath: string): string | null {
  if (!publicPath.startsWith('/uploads/')) {
    return null;
  }
  const rel = publicPath.slice('/uploads/'.length);
  if (!rel || rel.includes('..')) {
    return null;
  }
  const root = path.resolve(process.cwd(), 'uploads');
  const segments = rel.split('/').filter(Boolean);
  const resolved = path.resolve(root, ...segments);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }
  return resolved;
}
