const PREFIX = 'bf_easypay_launch:';

export function setEasypayPendingLaunchUrl(partnerExternalBookingId: string, launchUrl: string) {
  try {
    sessionStorage.setItem(PREFIX + partnerExternalBookingId, launchUrl);
  } catch {
    /* private mode / quota */
  }
}

export function getEasypayPendingLaunchUrl(partnerExternalBookingId: string): string | null {
  try {
    return sessionStorage.getItem(PREFIX + partnerExternalBookingId);
  } catch {
    return null;
  }
}

export function clearEasypayPendingLaunchUrl(partnerExternalBookingId: string) {
  try {
    sessionStorage.removeItem(PREFIX + partnerExternalBookingId);
  } catch {
    /* ignore */
  }
}
