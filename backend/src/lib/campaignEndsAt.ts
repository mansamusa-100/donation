const MS_PER_DAY = 86_400_000;

/** Start of the UTC calendar day containing `d` (00:00:00.000Z). Exported for seed scripts. */
export function utcCalendarDayStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Inclusive end instant for a YYYY-MM-DD deadline (23:59:59.999Z on that UTC calendar day).
 * Matches `<input type="date">` values interpreted as a fixed calendar date.
 */
export function endOfUtcCalendarDayFromDateString(yyyyMmDd: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(yyyyMmDd.trim());
  if (!m) {
    throw new Error('Invalid campaign end date format');
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const day = Number(m[3]);
  const endsAt = new Date(Date.UTC(y, mo - 1, day, 23, 59, 59, 999));
  if (
    endsAt.getUTCFullYear() !== y ||
    endsAt.getUTCMonth() !== mo - 1 ||
    endsAt.getUTCDate() !== day
  ) {
    throw new Error('Invalid campaign end date');
  }
  return endsAt;
}

/**
 * Days remaining for display, aligned with the create-campaign UI:
 * same calendar day as the end date counts as 1 day left; the day after end is 0.
 */
export function computeDaysLeftFromEndsAt(endsAt: Date, now = new Date()): number {
  const endDay = utcCalendarDayStart(endsAt);
  const today = utcCalendarDayStart(now);
  const diffMs = endDay.getTime() - today.getTime();
  if (diffMs < 0) {
    return 0;
  }
  return Math.min(365, Math.max(1, Math.ceil(diffMs / MS_PER_DAY)));
}

export function isCampaignDonationWindowOpen(endsAt: Date, now = new Date()): boolean {
  return utcCalendarDayStart(now).getTime() <= utcCalendarDayStart(endsAt).getTime();
}

export function validateNewCampaignEndDate(
  yyyyMmDd: string,
  now = new Date()
): { ok: true; endsAt: Date } | { ok: false; message: string } {
  let endsAt: Date;
  try {
    endsAt = endOfUtcCalendarDayFromDateString(yyyyMmDd);
  } catch {
    return { ok: false, message: 'Invalid campaign end date.' };
  }

  const endDay = utcCalendarDayStart(endsAt);
  const today = utcCalendarDayStart(now);
  if (endDay.getTime() < today.getTime()) {
    return { ok: false, message: 'Campaign end date cannot be in the past.' };
  }

  const maxEnd = new Date(today);
  maxEnd.setUTCDate(maxEnd.getUTCDate() + 365);
  if (endDay.getTime() > maxEnd.getTime()) {
    return { ok: false, message: 'Campaign end date cannot be more than 365 days from today.' };
  }

  return { ok: true, endsAt };
}
