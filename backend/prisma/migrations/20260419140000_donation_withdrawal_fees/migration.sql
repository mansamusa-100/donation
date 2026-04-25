-- AlterTable
ALTER TABLE "Donation" ADD COLUMN "platformFeeAmount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "WithdrawalRequest" ADD COLUMN "processingFeeAmount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "WithdrawalRequest" ADD COLUMN "netAmount" INTEGER NOT NULL DEFAULT 0;

-- Backfill donation fees (1.9% rounded)
UPDATE "Donation"
SET "platformFeeAmount" = (ROUND((amount::numeric * 190) / 10000))::integer;

-- Backfill withdrawal fees (3% rounded) for existing rows
UPDATE "WithdrawalRequest"
SET
  "processingFeeAmount" = (ROUND((amount::numeric * 300) / 10000))::integer,
  "netAmount" = amount - (ROUND((amount::numeric * 300) / 10000))::integer;
