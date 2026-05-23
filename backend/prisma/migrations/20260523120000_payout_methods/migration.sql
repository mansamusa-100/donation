-- Phase 2a: saved payout methods and withdrawal payout snapshots

CREATE TYPE "PayoutMethodType" AS ENUM ('Wallet', 'Bank', 'Cash');

CREATE TABLE "UserPayoutMethod" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "PayoutMethodType" NOT NULL,
    "label" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPayoutMethod_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserPayoutMethod_userId_idx" ON "UserPayoutMethod"("userId");

ALTER TABLE "UserPayoutMethod" ADD CONSTRAINT "UserPayoutMethod_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WithdrawalRequest" ADD COLUMN "payoutMethodType" "PayoutMethodType";
ALTER TABLE "WithdrawalRequest" ADD COLUMN "payoutLabel" TEXT;
ALTER TABLE "WithdrawalRequest" ADD COLUMN "payoutDetails" JSONB;
ALTER TABLE "WithdrawalRequest" ADD COLUMN "payoutReference" TEXT;
ALTER TABLE "WithdrawalRequest" ADD COLUMN "paidAt" TIMESTAMP(3);
ALTER TABLE "WithdrawalRequest" ADD COLUMN "paidByAdminId" TEXT;

ALTER TABLE "WithdrawalRequest" ADD CONSTRAINT "WithdrawalRequest_paidByAdminId_fkey" FOREIGN KEY ("paidByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
