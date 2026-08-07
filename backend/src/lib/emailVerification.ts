import {
  createPasswordResetToken,
  hashPasswordResetToken
} from './passwordResetToken.js';

export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

export function createEmailVerificationToken(): string {
  return createPasswordResetToken();
}

export function hashEmailVerificationToken(token: string): string {
  return hashPasswordResetToken(token);
}

export function emailVerificationExpiresAt(from = new Date()): Date {
  return new Date(from.getTime() + EMAIL_VERIFICATION_TTL_MS);
}

export function isEmailVerified(user: { emailVerifiedAt: Date | null | undefined }): boolean {
  return user.emailVerifiedAt != null;
}
