import type { BankTransferIntent, PlatformBankAccount } from '@prisma/client';
import { serializePlatformBankAccount } from './platformBankAccountSerialize.js';

type IntentWithBank = BankTransferIntent & {
  platformBankAccount?: PlatformBankAccount;
  campaign?: { title: string; slug: string };
  user?: { email: string; fullName: string } | null;
};

export function serializeBankTransferIntent(row: IntentWithBank) {
  return {
    id: row.id,
    clientReference: row.clientReference,
    campaignId: row.campaignId,
    campaignTitle: row.campaign?.title ?? null,
    campaignSlug: row.campaign?.slug ?? null,
    declaredAmount: row.declaredAmount,
    confirmedAmount: row.confirmedAmount,
    platformTipAmount: row.platformTipAmount,
    currency: row.currency,
    donorName: row.donorName,
    message: row.message,
    isAnonymous: row.isAnonymous,
    status: row.status,
    adminNote: row.adminNote,
    expiresAt: row.expiresAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    donationId: row.donationId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    donorEmail: row.user?.email ?? null,
    platformBankAccount: row.platformBankAccount
      ? serializePlatformBankAccount(row.platformBankAccount)
      : null
  };
}
