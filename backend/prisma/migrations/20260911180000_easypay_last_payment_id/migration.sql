-- Store DPay payment id on intents so reversal webhooks can resolve the booking.

ALTER TABLE "EasypayPaymentIntent" ADD COLUMN "lastPaymentId" TEXT;

CREATE INDEX "EasypayPaymentIntent_lastPaymentId_idx" ON "EasypayPaymentIntent"("lastPaymentId");
