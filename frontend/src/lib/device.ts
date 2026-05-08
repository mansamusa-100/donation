/**
 * Coarse mobile / tablet detection for checkout UX (deep link vs in-page QR / iframe).
 * Not for security — only for presenting the right controls.
 */
export function isCoarseMobileDevice(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }
  const ua = navigator.userAgent || '';
  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
    return true;
  }
  /* iPadOS 13+ often reports as Macintosh with touch */
  if (typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1) {
    if (/MacIntel/.test(navigator.platform) || /Macintosh/.test(ua)) {
      return true;
    }
  }
  return false;
}
