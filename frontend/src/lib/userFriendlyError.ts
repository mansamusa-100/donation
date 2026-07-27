/**
 * Map raw fetch/API errors to short copy suitable for donors and organizers.
 * Developer details (env vars, localhost, status codes) stay out of the UI.
 */
export function toUserFriendlyError(
  err: unknown,
  fallback = 'Something went wrong. Please try again.'
): string {
  if (!(err instanceof Error) || !err.message?.trim()) {
    return fallback;
  }

  const raw = err.message.trim();
  const lower = raw.toLowerCase();

  // Browser / network failures (offline, DNS, CORS, server unreachable)
  if (
    lower === 'failed to fetch' ||
    lower === 'load failed' ||
    lower === 'networkerror when attempting to fetch resource.' ||
    lower.includes('networkerror') ||
    lower.includes('network request failed') ||
    lower.includes('fetch failed') ||
    err.name === 'TypeError' && lower.includes('fetch')
  ) {
    return 'We could not reach the server. Please check your internet connection and try again.';
  }

  if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('abort')) {
    return 'The request took too long. Please check your connection and try again.';
  }

  // Never surface internal / env hints to end users
  if (
    lower.includes('vite_') ||
    lower.includes('localhost') ||
    lower.includes('api_base') ||
    lower.includes('api is running')
  ) {
    return fallback;
  }

  // Generic HTTP status phrasing from our client
  if (/^request failed with status \d+$/i.test(raw)) {
    const status = Number(raw.match(/\d+/)?.[0]);
    if (status === 401 || status === 403) {
      return 'You need to sign in again to continue.';
    }
    if (status === 404) {
      return 'We could not find what you were looking for.';
    }
    if (status >= 500) {
      return 'Our servers are having trouble right now. Please try again in a moment.';
    }
    return fallback;
  }

  // Server messages are usually already user-facing (Zod / HttpError)
  return raw;
}
