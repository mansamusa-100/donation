import { prisma } from './prisma.js';

/** Marks Pending bank transfers past expiresAt as Expired. */
export async function expireStaleBankTransferIntents(now = new Date()): Promise<number> {
  const result = await prisma.bankTransferIntent.updateMany({
    where: {
      status: 'Pending',
      expiresAt: { lt: now }
    },
    data: { status: 'Expired' }
  });
  return result.count;
}
