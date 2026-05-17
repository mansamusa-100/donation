const MS_PER_DAY = 86_400_000;

export function utcCalendarDayStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

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

export function computeDaysLeftFromEndsAt(endsAt: Date, now = new Date()): number {
  const endDay = utcCalendarDayStart(endsAt);
  const today = utcCalendarDayStart(now);
  const diffMs = endDay.getTime() - today.getTime();
  if (diffMs < 0) {
    return 0;
  }
  return Math.min(365, Math.max(1, Math.ceil(diffMs / MS_PER_DAY)));
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
