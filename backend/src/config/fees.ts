/**
 * Platform fee on each donation (1.9%). Gross `amount` is what donors and campaigns see;
 * `platformFeeAmount` is stored for admin/reporting only.
 */
export function donationPlatformFeeFromGross(grossAmount: number): number {
  if (grossAmount <= 0) {
    return 0;
  }
  return Math.round((grossAmount * 190) / 10000);
}

/**
 * Processing fee on a withdrawal request (3% of requested amount). Organizer receives `netAmount`.
 */
export function withdrawalProcessingFeeFromGross(requestedAmount: number): number {
  if (requestedAmount <= 0) {
    return 0;
  }
  return Math.round((requestedAmount * 300) / 10000);
}

export function withdrawalNetToOrganizer(requestedAmount: number): number {
  const fee = withdrawalProcessingFeeFromGross(requestedAmount);
  return Math.max(0, requestedAmount - fee);
}
