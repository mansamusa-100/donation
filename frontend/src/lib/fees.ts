/** Keep in sync with `backend/src/config/fees.ts` (basis points). */

export const DONATION_PLATFORM_FEE_PERCENT = 1.9;
export const WITHDRAWAL_PROCESSING_FEE_PERCENT = 1.5;

function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Live preview for organizer withdrawal forms (matches server rounding). */
export function withdrawalProcessingFeeFromGross(requestedAmount: number): number {
  if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
    return 0;
  }
  return roundMoney((requestedAmount * (WITHDRAWAL_PROCESSING_FEE_PERCENT * 100)) / 10000);
}

export function withdrawalNetToOrganizer(requestedAmount: number): number {
  const fee = withdrawalProcessingFeeFromGross(requestedAmount);
  return Math.max(0, roundMoney(requestedAmount - fee));
}
