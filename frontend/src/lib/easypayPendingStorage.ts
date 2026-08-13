const PREFIX = 'bf_easypay_launch:';
const AUTOLAUNCH_DONE_PREFIX = 'bf_easypay_autolaunch_done:';

export type EasypayPendingWalletChannel = 'wave' | 'yonna';

export type EasypayPendingWalletSession = {
  launchUrl: string;
  qrPayload?: string;
  channel?: EasypayPendingWalletChannel;
};

export function setEasypayPendingWalletSession(
  partnerExternalBookingId: string,
  session: EasypayPendingWalletSession
) {
  try {
    const payload: EasypayPendingWalletSession = {
      launchUrl: session.launchUrl,
      ...(session.qrPayload != null && session.qrPayload !== '' ? { qrPayload: session.qrPayload } : {}),
      ...(session.channel ? { channel: session.channel } : {})
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
        const channel =
          parsed.channel === 'wave' || parsed.channel === 'yonna' ? parsed.channel : undefined;
        return {
          launchUrl: parsed.launchUrl,
          qrPayload: typeof parsed.qrPayload === 'string' ? parsed.qrPayload : undefined,
          ...(channel ? { channel } : {})
        };
      }
      return null;
    }
    return { launchUrl: raw };
  } catch {
    return null;
  }
}

export function markEasypayAutolaunchDone(partnerExternalBookingId: string) {
  try {
    sessionStorage.setItem(AUTOLAUNCH_DONE_PREFIX + partnerExternalBookingId, '1');
  } catch {
    /* ignore */
  }
}

export function wasEasypayAutolaunchDone(partnerExternalBookingId: string): boolean {
  try {
    return sessionStorage.getItem(AUTOLAUNCH_DONE_PREFIX + partnerExternalBookingId) === '1';
  } catch {
    return false;
  }
}

export function clearEasypayPendingWalletSession(partnerExternalBookingId: string) {
  try {
    sessionStorage.removeItem(PREFIX + partnerExternalBookingId);
    sessionStorage.removeItem(AUTOLAUNCH_DONE_PREFIX + partnerExternalBookingId);
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
