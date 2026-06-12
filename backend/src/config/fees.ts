import { roundMoney } from '../lib/money.js';

/**
 * Platform fee on each donation (1.9%). Public campaign totals stay gross, but
 * withdrawal availability deducts this fee from organizer-accessible funds.
 * Rounded to 2 decimal places (bututs).
 */
export function donationPlatformFeeFromGross(grossAmount: number): number {
  if (grossAmount <= 0) {
    return 0;
  }
  return roundMoney((grossAmount * 190) / 10000);
}

/**
 * Processing fee on a withdrawal request (3% of requested amount). Organizer receives `netAmount`.
 * Rounded to 2 decimal places (bututs).
 */
export function withdrawalProcessingFeeFromGross(requestedAmount: number): number {
  if (requestedAmount <= 0) {
    return 0;
  }
  return roundMoney((requestedAmount * 300) / 10000);
}

export function withdrawalNetToOrganizer(requestedAmount: number): number {
  const fee = withdrawalProcessingFeeFromGross(requestedAmount);
  return Math.max(0, roundMoney(requestedAmount - fee));
}
