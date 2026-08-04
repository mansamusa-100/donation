import { randomBytes } from 'node:crypto';
import { prisma } from './prisma.js';

const REF_PREFIX = 'BF-';
/** 16 random bytes → ~128 bits of entropy (base64url, no padding). */
const REF_RANDOM_BYTES = 16;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const BANK_TRANSFER_EXPIRY_DAYS = 5;
export const BANK_TRANSFER_EXPIRY_MS = BANK_TRANSFER_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

export function bankTransferExpiresAt(from = new Date()): Date {
  return new Date(from.getTime() + BANK_TRANSFER_EXPIRY_MS);
}

/**
 * High-entropy bank transfer reference for public status lookup.
 * Prefer crypto base64url; fall back to alphabet encoding if needed for uniqueness retries.
 */
function randomReferenceBody(useAlphabetFallback = false): string {
  if (!useAlphabetFallback) {
    return randomBytes(REF_RANDOM_BYTES).toString('base64url');
  }
  const bytes = randomBytes(22);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}

export async function generateUniqueBankTransferReference(): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const candidate = `${REF_PREFIX}${randomReferenceBody(attempt >= 8)}`;
    const existing = await prisma.bankTransferIntent.findUnique({
      where: { clientReference: candidate },
      select: { id: true }
    });
    if (!existing) {
      return candidate;
    }
  }
  throw new Error('Could not generate a unique bank transfer reference');
}
