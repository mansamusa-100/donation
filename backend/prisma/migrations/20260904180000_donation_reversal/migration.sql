-- Donation reversal: keep the row, unwind ledger when DPay reverses a payment.

ALTER TABLE "Donation" ADD COLUMN "reversedAt" TIMESTAMP(3);
ALTER TABLE "Donation" ADD COLUMN "reversalReason" TEXT;

CREATE INDEX "Donation_campaignId_reversedAt_idx" ON "Donation"("campaignId", "reversedAt");

ALTER TABLE "EasypayPaymentIntent" ADD COLUMN "reversedAt" TIMESTAMP(3);

ALTER TABLE "PlatformTip" ADD COLUMN "reversedAt" TIMESTAMP(3);
