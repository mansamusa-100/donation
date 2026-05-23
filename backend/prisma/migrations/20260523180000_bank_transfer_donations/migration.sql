-- Bank transfer donations (manual verification)

CREATE TYPE "BankTransferStatus" AS ENUM ('Pending', 'Confirmed', 'Rejected', 'Expired');

CREATE TABLE "PlatformBankAccount" (
    "id" TEXT NOT NULL,
    "label" TEXT,
    "accountName" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "swiftCode" TEXT NOT NULL,
    "bban" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformBankAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BankTransferIntent" (
    "id" TEXT NOT NULL,
    "clientReference" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT,
    "platformBankAccountId" TEXT NOT NULL,
    "declaredAmount" INTEGER NOT NULL,
    "confirmedAmount" INTEGER,
    "platformTipAmount" INTEGER NOT NULL DEFAULT 0,
    "currency" "Currency" NOT NULL DEFAULT 'GMD',
    "donorName" TEXT NOT NULL,
    "message" TEXT,
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "avatarUrl" TEXT,
    "status" "BankTransferStatus" NOT NULL DEFAULT 'Pending',
    "adminNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "donationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankTransferIntent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BankTransferIntent_clientReference_key" ON "BankTransferIntent"("clientReference");
CREATE UNIQUE INDEX "BankTransferIntent_donationId_key" ON "BankTransferIntent"("donationId");
CREATE INDEX "BankTransferIntent_status_createdAt_idx" ON "BankTransferIntent"("status", "createdAt");
CREATE INDEX "BankTransferIntent_campaignId_idx" ON "BankTransferIntent"("campaignId");
CREATE INDEX "BankTransferIntent_clientReference_idx" ON "BankTransferIntent"("clientReference");

ALTER TABLE "BankTransferIntent" ADD CONSTRAINT "BankTransferIntent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BankTransferIntent" ADD CONSTRAINT "BankTransferIntent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BankTransferIntent" ADD CONSTRAINT "BankTransferIntent_platformBankAccountId_fkey" FOREIGN KEY ("platformBankAccountId") REFERENCES "PlatformBankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankTransferIntent" ADD CONSTRAINT "BankTransferIntent_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BankTransferIntent" ADD CONSTRAINT "BankTransferIntent_donationId_fkey" FOREIGN KEY ("donationId") REFERENCES "Donation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PlatformTip" ADD COLUMN "bankTransferIntentId" TEXT;
CREATE UNIQUE INDEX "PlatformTip_bankTransferIntentId_key" ON "PlatformTip"("bankTransferIntentId");
ALTER TABLE "PlatformTip" ADD CONSTRAINT "PlatformTip_bankTransferIntentId_fkey" FOREIGN KEY ("bankTransferIntentId") REFERENCES "BankTransferIntent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
