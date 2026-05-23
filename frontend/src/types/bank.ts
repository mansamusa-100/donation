export interface PlatformBankAccount {
  id: string;
  label: string | null;
  accountName: string;
  bankName: string;
  accountNumber: string;
  swiftCode: string;
  bban: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type BankTransferStatus = 'Pending' | 'Confirmed' | 'Rejected' | 'Expired';

export interface BankTransferIntentRow {
  id: string;
  clientReference: string;
  campaignId: string;
  campaignTitle: string | null;
  campaignSlug: string | null;
  declaredAmount: number;
  confirmedAmount: number | null;
  platformTipAmount: number;
  currency: string;
  donorName: string;
  message: string | null;
  isAnonymous: boolean;
  status: BankTransferStatus;
  adminNote: string | null;
  expiresAt: string;
  reviewedAt: string | null;
  donationId: string | null;
  createdAt: string;
  updatedAt: string;
  donorEmail: string | null;
  platformBankAccount: PlatformBankAccount | null;
}

export interface BankTransferInitiateResult {
  clientReference: string;
  expiresAt: string;
  declaredAmount: number;
  platformTipAmount: number;
  currency: string;
  campaignTitle: string;
  campaignSlug: string;
  platformBankAccount: PlatformBankAccount;
  instructions: {
    referenceLabel: string;
    expiryDays: number;
  };
}
