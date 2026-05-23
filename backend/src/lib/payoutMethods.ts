import { PayoutMethodType } from '@prisma/client';
import { z } from 'zod';

export const WALLET_PROVIDERS = ['Wave', 'APS', 'Yonna', 'Other'] as const;

const walletDetailsSchema = z.object({
  provider: z.enum(WALLET_PROVIDERS),
  mobileNumber: z.string().min(7).max(20)
});

const bankDetailsSchema = z.object({
  bankName: z.string().min(2).max(120),
  accountName: z.string().min(2).max(120),
  accountNumber: z.string().min(4).max(40),
  branch: z.string().max(120).optional()
});

const cashDetailsSchema = z.object({
  recipientName: z.string().min(2).max(120),
  phoneNumber: z.string().min(7).max(20),
  pickupNotes: z.string().max(500).optional()
});

export const createPayoutMethodSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('Wallet'),
    label: z.string().max(80).optional(),
    isDefault: z.boolean().optional(),
    details: walletDetailsSchema
  }),
  z.object({
    type: z.literal('Bank'),
    label: z.string().max(80).optional(),
    isDefault: z.boolean().optional(),
    details: bankDetailsSchema
  }),
  z.object({
    type: z.literal('Cash'),
    label: z.string().max(80).optional(),
    isDefault: z.boolean().optional(),
    details: cashDetailsSchema
  })
]);

export const updatePayoutMethodSchema = z.object({
  label: z.string().max(80).optional(),
  isDefault: z.boolean().optional(),
  details: z.union([walletDetailsSchema, bankDetailsSchema, cashDetailsSchema]).optional()
});

export type PayoutDetails = z.infer<typeof walletDetailsSchema> | z.infer<typeof bankDetailsSchema> | z.infer<typeof cashDetailsSchema>;

export function validatePayoutDetails(type: PayoutMethodType, details: unknown): PayoutDetails {
  switch (type) {
    case 'Wallet':
      return walletDetailsSchema.parse(details);
    case 'Bank':
      return bankDetailsSchema.parse(details);
    case 'Cash':
      return cashDetailsSchema.parse(details);
    default:
      throw new Error('Invalid payout method type');
  }
}

export function maskAccountNumber(value: string): string {
  const digits = value.replace(/\s/g, '');
  if (digits.length <= 4) {
    return '****';
  }
  return `****${digits.slice(-4)}`;
}

export function maskMobile(value: string): string {
  const trimmed = value.replace(/\s/g, '');
  if (trimmed.length <= 4) {
    return '****';
  }
  return `***${trimmed.slice(-4)}`;
}

export function formatPayoutSummary(
  type: PayoutMethodType,
  details: unknown,
  label?: string | null
): string {
  const prefix = label?.trim() ? `${label.trim()} · ` : '';
  try {
    switch (type) {
      case 'Wallet': {
        const d = walletDetailsSchema.parse(details);
        return `${prefix}${d.provider} ${maskMobile(d.mobileNumber)}`;
      }
      case 'Bank': {
        const d = bankDetailsSchema.parse(details);
        return `${prefix}${d.bankName} ${maskAccountNumber(d.accountNumber)}`;
      }
      case 'Cash': {
        const d = cashDetailsSchema.parse(details);
        return `${prefix}Cash · ${d.recipientName}`;
      }
      default:
        return prefix || type;
    }
  } catch {
    return prefix || type;
  }
}

export function formatPayoutDetailsFull(type: PayoutMethodType, details: unknown): string {
  try {
    switch (type) {
      case 'Wallet': {
        const d = walletDetailsSchema.parse(details);
        return `${d.provider} — ${d.mobileNumber}`;
      }
      case 'Bank': {
        const d = bankDetailsSchema.parse(details);
        return `${d.bankName} — ${d.accountName} — ${d.accountNumber}${d.branch ? ` (${d.branch})` : ''}`;
      }
      case 'Cash': {
        const d = cashDetailsSchema.parse(details);
        return `${d.recipientName} — ${d.phoneNumber}${d.pickupNotes ? ` — ${d.pickupNotes}` : ''}`;
      }
      default:
        return '';
    }
  } catch {
    return '';
  }
}

export function serializePayoutMethod(row: {
  id: string;
  type: PayoutMethodType;
  label: string | null;
  isDefault: boolean;
  details: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    type: row.type,
    label: row.label,
    isDefault: row.isDefault,
    details: row.details,
    summary: formatPayoutSummary(row.type, row.details, row.label),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

/** Multi-line block for transactional emails (organizer + admin). */
export function buildPayoutDetailsEmailSection(params: {
  payoutMethodType?: PayoutMethodType | null;
  payoutLabel?: string | null;
  payoutDetails?: unknown;
  payoutReference?: string | null;
  paidAt?: Date | null;
}): string {
  if (!params.payoutMethodType || params.payoutDetails == null) {
    return 'Payout method: Not recorded on this request.\n';
  }

  const labelSuffix = params.payoutLabel?.trim() ? ` (${params.payoutLabel.trim()})` : '';
  const lines = [
    '--- Payout details ---',
    `Method: ${params.payoutMethodType}${labelSuffix}`,
    formatPayoutDetailsFull(params.payoutMethodType, params.payoutDetails)
  ];

  if (params.payoutReference?.trim()) {
    lines.push(`Payment reference: ${params.payoutReference.trim()}`);
  }
  if (params.paidAt) {
    lines.push(
      `Marked paid: ${params.paidAt.toLocaleString('en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'UTC'
      })} UTC`
    );
  }
  lines.push('---');
  return `${lines.join('\n')}\n`;
}

export function serializeWithdrawalPayout(row: {
  payoutMethodType?: PayoutMethodType | null;
  payoutLabel?: string | null;
  payoutDetails?: unknown;
  payoutReference?: string | null;
  paidAt?: Date | null;
}) {
  if (!row.payoutMethodType || row.payoutDetails == null) {
    return {
      payoutMethodType: null,
      payoutLabel: null,
      payoutDetails: null,
      payoutSummary: null,
      payoutDetailsFull: null,
      payoutReference: row.payoutReference ?? null,
      paidAt: row.paidAt?.toISOString() ?? null
    };
  }
  return {
    payoutMethodType: row.payoutMethodType,
    payoutLabel: row.payoutLabel,
    payoutDetails: row.payoutDetails,
    payoutSummary: formatPayoutSummary(row.payoutMethodType, row.payoutDetails, row.payoutLabel),
    payoutDetailsFull: formatPayoutDetailsFull(row.payoutMethodType, row.payoutDetails),
    payoutReference: row.payoutReference ?? null,
    paidAt: row.paidAt?.toISOString() ?? null
  };
}
