const PREFIX = 'bf_easypay_launch:';

export type EasypayPendingWalletSession = {
  launchUrl: string;
  qrPayload?: string;
};

export function setEasypayPendingWalletSession(
  partnerExternalBookingId: string,
  session: EasypayPendingWalletSession
) {
  try {
    const payload: EasypayPendingWalletSession = {
      launchUrl: session.launchUrl,
      ...(session.qrPayload != null && session.qrPayload !== '' ? { qrPayload: session.qrPayload } : {})
    };
    sessionStorage.setItem(PREFIX + partnerExternalBookingId, JSON.stringify(payload));
  } catch {
    try {
      sessionStorage.setItem(PREFIX + partnerExternalBookingId, session.launchUrl);
    } catch {
      /* private mode / quota */
    }
  }
}

export function getEasypayPendingWalletSession(
  partnerExternalBookingId: string
): EasypayPendingWalletSession | null {
  try {
    const raw = sessionStorage.getItem(PREFIX + partnerExternalBookingId);
    if (!raw) {
      return null;
    }
    if (raw.startsWith('{')) {
      const parsed = JSON.parse(raw) as Partial<EasypayPendingWalletSession> & {
        paymentHtml?: unknown;
      };
      if (parsed && typeof parsed.launchUrl === 'string') {
        return {
          launchUrl: parsed.launchUrl,
          qrPayload: typeof parsed.qrPayload === 'string' ? parsed.qrPayload : undefined
        };
      }
      return null;
    }
    return { launchUrl: raw };
  } catch {
    return null;
  }
}

export function clearEasypayPendingWalletSession(partnerExternalBookingId: string) {
  try {
    sessionStorage.removeItem(PREFIX + partnerExternalBookingId);
  } catch {
    /* ignore */
  }
}

/** @deprecated use setEasypayPendingWalletSession */
export function setEasypayPendingLaunchUrl(partnerExternalBookingId: string, launchUrl: string) {
  setEasypayPendingWalletSession(partnerExternalBookingId, { launchUrl });
}

/** @deprecated use getEasypayPendingWalletSession */
export function getEasypayPendingLaunchUrl(partnerExternalBookingId: string): string | null {
  return getEasypayPendingWalletSession(partnerExternalBookingId)?.launchUrl ?? null;
}

/** @deprecated use clearEasypayPendingWalletSession */
export function clearEasypayPendingLaunchUrl(partnerExternalBookingId: string) {
  clearEasypayPendingWalletSession(partnerExternalBookingId);
}
