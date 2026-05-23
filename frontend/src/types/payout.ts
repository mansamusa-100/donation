export type PayoutMethodType = 'Wallet' | 'Bank' | 'Cash';

export type WalletProvider = 'Wave' | 'APS' | 'Yonna' | 'Other';

export interface WalletPayoutDetails {
  provider: WalletProvider;
  mobileNumber: string;
}

export interface BankPayoutDetails {
  bankName: string;
  accountName: string;
  accountNumber: string;
  branch?: string;
}

export interface CashPayoutDetails {
  recipientName: string;
  phoneNumber: string;
  pickupNotes?: string;
}

export type PayoutDetails = WalletPayoutDetails | BankPayoutDetails | CashPayoutDetails;

export interface UserPayoutMethod {
  id: string;
  type: PayoutMethodType;
  label: string | null;
  isDefault: boolean;
  details: PayoutDetails;
  summary: string;
  createdAt: string;
  updatedAt: string;
}

export interface WithdrawalPayoutInfo {
  payoutMethodType: PayoutMethodType | null;
  payoutLabel: string | null;
  payoutDetails: PayoutDetails | null;
  payoutSummary: string | null;
  payoutDetailsFull: string | null;
  payoutReference: string | null;
  paidAt: string | null;
}
