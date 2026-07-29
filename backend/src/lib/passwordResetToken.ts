import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** Raw token emailed to the user (never store this). */
export function createPasswordResetToken(): string {
  return randomBytes(32).toString('base64url');
}

/** SHA-256 hex digest stored in `User.passwordResetToken`. */
export function hashPasswordResetToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Constant-time compare of a submitted raw token against a stored hash. */
export function passwordResetTokenMatches(rawToken: string, storedHash: string): boolean {
  const a = Buffer.from(hashPasswordResetToken(rawToken), 'utf8');
  const b = Buffer.from(storedHash, 'utf8');
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}
