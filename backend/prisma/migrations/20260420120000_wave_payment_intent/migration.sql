-- CreateTable
CREATE TABLE "WavePaymentIntent" (
    "id" TEXT NOT NULL,
    "clientReference" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'GMD',
    "donorName" TEXT NOT NULL,
    "message" TEXT,
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "waveSessionId" TEXT,
    "waveCheckoutStatus" TEXT,
    "wavePaymentStatus" TEXT,
    "donationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WavePaymentIntent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WavePaymentIntent_clientReference_key" ON "WavePaymentIntent"("clientReference");

-- CreateIndex
CREATE UNIQUE INDEX "WavePaymentIntent_donationId_key" ON "WavePaymentIntent"("donationId");

-- CreateIndex
CREATE INDEX "WavePaymentIntent_campaignId_idx" ON "WavePaymentIntent"("campaignId");

-- AddForeignKey
ALTER TABLE "WavePaymentIntent" ADD CONSTRAINT "WavePaymentIntent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WavePaymentIntent" ADD CONSTRAINT "WavePaymentIntent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WavePaymentIntent" ADD CONSTRAINT "WavePaymentIntent_donationId_fkey" FOREIGN KEY ("donationId") REFERENCES "Donation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
