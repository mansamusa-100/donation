const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

/** Turn a stored cover path (`/uploads/...`) or absolute URL into a browser-usable image URL. */
export function mediaUrl(pathOrUrl: string): string {
  if (!pathOrUrl) {
    return '';
  }
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    return pathOrUrl;
  }
  if (pathOrUrl.startsWith('/')) {
    return `${API_BASE}${pathOrUrl}`;
  }
  return `${API_BASE}/${pathOrUrl}`;
}
