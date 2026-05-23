import type { PlatformBankAccount } from '@prisma/client';

export function serializePlatformBankAccount(row: PlatformBankAccount) {
  return {
    id: row.id,
    label: row.label,
    accountName: row.accountName,
    bankName: row.bankName,
    accountNumber: row.accountNumber,
    swiftCode: row.swiftCode,
    bban: row.bban,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}
