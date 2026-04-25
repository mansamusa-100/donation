-- Optional voluntary platform tip (same checkout as campaign donation via Wave).
ALTER TABLE "WavePaymentIntent" ADD COLUMN "platformTipAmount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "PlatformStat" ADD COLUMN "totalPlatformTips" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "PlatformTip" (
    "id" TEXT NOT NULL,
    "wavePaymentIntentId" TEXT,
    "userId" TEXT,
    "donorName" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'GMD',
    "campaignId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformTip_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformTip_wavePaymentIntentId_key" ON "PlatformTip"("wavePaymentIntentId");

CREATE INDEX "PlatformTip_campaignId_idx" ON "PlatformTip"("campaignId");
CREATE INDEX "PlatformTip_userId_idx" ON "PlatformTip"("userId");

ALTER TABLE "PlatformTip" ADD CONSTRAINT "PlatformTip_wavePaymentIntentId_fkey" FOREIGN KEY ("wavePaymentIntentId") REFERENCES "WavePaymentIntent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlatformTip" ADD CONSTRAINT "PlatformTip_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlatformTip" ADD CONSTRAINT "PlatformTip_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
