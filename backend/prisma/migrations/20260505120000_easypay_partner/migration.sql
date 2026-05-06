-- Easypay internal-partner payment intents and webhook dedupe

CREATE TABLE "EasypayPaymentIntent" (
    "id" TEXT NOT NULL,
    "partnerExternalBookingId" TEXT NOT NULL,
    "easypayOrderId" TEXT NOT NULL,
    "orderPublicCode" TEXT,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT,
    "amount" INTEGER NOT NULL,
    "platformTipAmount" INTEGER NOT NULL DEFAULT 0,
    "currency" "Currency" NOT NULL DEFAULT 'GMD',
    "donorName" TEXT NOT NULL,
    "message" TEXT,
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "avatarUrl" TEXT,
    "lastGatewayCode" TEXT,
    "donationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EasypayPaymentIntent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EasypayWebhookReceipt" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EasypayWebhookReceipt_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PlatformTip" ADD COLUMN "easypayPaymentIntentId" TEXT;

CREATE UNIQUE INDEX "EasypayPaymentIntent_partnerExternalBookingId_key" ON "EasypayPaymentIntent"("partnerExternalBookingId");
CREATE UNIQUE INDEX "EasypayPaymentIntent_donationId_key" ON "EasypayPaymentIntent"("donationId");
CREATE INDEX "EasypayPaymentIntent_campaignId_idx" ON "EasypayPaymentIntent"("campaignId");
CREATE INDEX "EasypayPaymentIntent_easypayOrderId_idx" ON "EasypayPaymentIntent"("easypayOrderId");

CREATE UNIQUE INDEX "EasypayWebhookReceipt_paymentId_event_key" ON "EasypayWebhookReceipt"("paymentId", "event");

ALTER TABLE "EasypayPaymentIntent" ADD CONSTRAINT "EasypayPaymentIntent_donationId_fkey" FOREIGN KEY ("donationId") REFERENCES "Donation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EasypayPaymentIntent" ADD CONSTRAINT "EasypayPaymentIntent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EasypayPaymentIntent" ADD CONSTRAINT "EasypayPaymentIntent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "PlatformTip_easypayPaymentIntentId_key" ON "PlatformTip"("easypayPaymentIntentId");
ALTER TABLE "PlatformTip" ADD CONSTRAINT "PlatformTip_easypayPaymentIntentId_fkey" FOREIGN KEY ("easypayPaymentIntentId") REFERENCES "EasypayPaymentIntent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
