import type { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

/** Row-lock payment intents so concurrent webhook + poll cannot double-credit. */
export async function lockWavePaymentIntentForUpdate(tx: Tx, id: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "WavePaymentIntent" WHERE id = ${id} FOR UPDATE`;
}

export async function lockEasypayPaymentIntentForUpdate(tx: Tx, id: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "EasypayPaymentIntent" WHERE id = ${id} FOR UPDATE`;
}

export async function lockBankTransferIntentForUpdate(tx: Tx, id: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "BankTransferIntent" WHERE id = ${id} FOR UPDATE`;
}
