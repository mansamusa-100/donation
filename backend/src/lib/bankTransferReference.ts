import { randomBytes } from 'node:crypto';
import { prisma } from './prisma.js';

const REF_PREFIX = 'BF-';
/**
 * Uppercase Crockford-ish alphabet (no 0/O/1/I) — safe for bank remarks and case-insensitive lookup.
 * 26 chars ≈ 130 bits (32^26), vs the old 6-char (~30-bit) refs.
 */
const REF_BODY_LENGTH = 26;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const BANK_TRANSFER_EXPIRY_DAYS = 5;
export const BANK_TRANSFER_EXPIRY_MS = BANK_TRANSFER_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

export function bankTransferExpiresAt(from = new Date()): Date {
  return new Date(from.getTime() + BANK_TRANSFER_EXPIRY_MS);
}

/** Normalize a user-entered or URL reference for DB lookup. */
export function normalizeBankTransferReference(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}

function randomReferenceBody(): string {
  // Rejection sampling avoids modulo bias.
  const out: string[] = [];
  while (out.length < REF_BODY_LENGTH) {
    const bytes = randomBytes(REF_BODY_LENGTH - out.length + 8);
    for (const b of bytes) {
      if (out.length >= REF_BODY_LENGTH) {
        break;
      }
      // 256 - (256 % 32) = 256; every byte is usable with alphabet size 32.
      out.push(ALPHABET[b % ALPHABET.length]!);
    }
  }
  return out.join('');
}

export async function generateUniqueBankTransferReference(): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const candidate = `${REF_PREFIX}${randomReferenceBody()}`;
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
