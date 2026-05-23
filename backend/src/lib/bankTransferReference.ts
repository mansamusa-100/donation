import { randomBytes } from 'node:crypto';
import { prisma } from './prisma.js';

const REF_PREFIX = 'BF-';
const REF_BODY_LENGTH = 6;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const BANK_TRANSFER_EXPIRY_DAYS = 5;
export const BANK_TRANSFER_EXPIRY_MS = BANK_TRANSFER_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

export function bankTransferExpiresAt(from = new Date()): Date {
  return new Date(from.getTime() + BANK_TRANSFER_EXPIRY_MS);
}

function randomReferenceBody(): string {
  const bytes = randomBytes(REF_BODY_LENGTH);
  let out = '';
  for (let i = 0; i < REF_BODY_LENGTH; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
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
