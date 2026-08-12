/** Normalize and validate public contact phone / WhatsApp numbers. */

const PHONE_DISPLAY_MAX = 32;

export function normalizeContactPhone(raw: string | null | undefined): string | null {
  if (raw == null) {
    return null;
  }
  const trimmed = raw.replace(/\s+/g, ' ').trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, PHONE_DISPLAY_MAX);
}

export function contactPhoneDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export function isValidContactPhone(value: string): boolean {
  const digits = contactPhoneDigits(value);
  return digits.length >= 7 && digits.length <= 15;
}
