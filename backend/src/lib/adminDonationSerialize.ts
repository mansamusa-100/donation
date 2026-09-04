import type {
  Donation,
  Campaign,
  User,
  WavePaymentIntent,
  EasypayPaymentIntent,
  BankTransferIntent
} from '@prisma/client';

export type AdminDonationCheckoutMethod = 'wave' | 'easypay' | 'bank' | 'direct';

export type DonationWithCheckout = Donation & {
  campaign: Pick<Campaign, 'id' | 'title' | 'slug'>;
  user: Pick<User, 'id' | 'fullName' | 'email'> | null;
  wavePaymentIntent: Pick<WavePaymentIntent, 'clientReference' | 'platformTipAmount'> | null;
  easypayPaymentIntent: Pick<
    EasypayPaymentIntent,
    'partnerExternalBookingId' | 'orderPublicCode' | 'lastGatewayCode' | 'platformTipAmount'
  > | null;
  bankTransferIntent: Pick<BankTransferIntent, 'clientReference' | 'platformTipAmount'> | null;
};

const CHECKOUT_LABELS: Record<AdminDonationCheckoutMethod, string> = {
  wave: 'Wave',
  easypay: 'DPay',
  bank: 'Bank transfer',
  direct: 'Direct'
};

export function resolveDonationCheckout(donation: DonationWithCheckout): {
  checkoutMethod: AdminDonationCheckoutMethod;
  checkoutLabel: string;
  paymentReference: string | null;
  easypayGatewayCode: string | null;
  platformTipAmount: number;
} {
  if (donation.wavePaymentIntent) {
    return {
      checkoutMethod: 'wave',
      checkoutLabel: CHECKOUT_LABELS.wave,
      paymentReference: donation.wavePaymentIntent.clientReference,
      easypayGatewayCode: null,
      platformTipAmount: donation.wavePaymentIntent.platformTipAmount
    };
  }
  if (donation.easypayPaymentIntent) {
    const ep = donation.easypayPaymentIntent;
    return {
      checkoutMethod: 'easypay',
      checkoutLabel: CHECKOUT_LABELS.easypay,
      paymentReference: ep.orderPublicCode || ep.partnerExternalBookingId,
      easypayGatewayCode: ep.lastGatewayCode,
      platformTipAmount: ep.platformTipAmount
    };
  }
  if (donation.bankTransferIntent) {
    return {
      checkoutMethod: 'bank',
      checkoutLabel: CHECKOUT_LABELS.bank,
      paymentReference: donation.bankTransferIntent.clientReference,
      easypayGatewayCode: null,
      platformTipAmount: donation.bankTransferIntent.platformTipAmount
    };
  }
  return {
    checkoutMethod: 'direct',
    checkoutLabel: CHECKOUT_LABELS.direct,
    paymentReference: null,
    easypayGatewayCode: null,
    platformTipAmount: 0
  };
}

export function serializeAdminDonationTransaction(donation: DonationWithCheckout) {
  const checkout = resolveDonationCheckout(donation);
  const reversed = donation.reversedAt != null;
  return {
    id: donation.id,
    createdAt: donation.createdAt.toISOString(),
    status: reversed ? ('reversed' as const) : ('completed' as const),
    reversedAt: donation.reversedAt?.toISOString() ?? null,
    reversalReason: donation.reversalReason ?? null,
    donorDisplayName: donation.isAnonymous ? 'Anonymous' : donation.donorName,
    isAnonymous: donation.isAnonymous,
    amount: donation.amount,
    platformFeeAmount: donation.platformFeeAmount,
    platformTipAmount: checkout.platformTipAmount,
    currency: donation.currency,
    message: donation.message,
    checkoutMethod: checkout.checkoutMethod,
    checkoutLabel: checkout.checkoutLabel,
    paymentReference: checkout.paymentReference,
    easypayGatewayCode: checkout.easypayGatewayCode,
    campaign: {
      id: donation.campaign.id,
      title: donation.campaign.title,
      slug: donation.campaign.slug
    },
    user: donation.user
      ? {
          id: donation.user.id,
          fullName: donation.user.fullName,
          email: donation.user.email
        }
      : null
  };
}

export const donationCheckoutInclude = {
  campaign: { select: { id: true, title: true, slug: true } },
  user: { select: { id: true, fullName: true, email: true } },
  wavePaymentIntent: {
    select: { clientReference: true, platformTipAmount: true }
  },
  easypayPaymentIntent: {
    select: {
      partnerExternalBookingId: true,
      orderPublicCode: true,
      lastGatewayCode: true,
      platformTipAmount: true
    }
  },
  bankTransferIntent: {
    select: { clientReference: true, platformTipAmount: true }
  }
} as const;
