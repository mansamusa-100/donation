-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN "endsAt" TIMESTAMP(3);

UPDATE "Campaign"
SET "endsAt" = "createdAt" + ("daysLeft" * INTERVAL '1 day')
WHERE "endsAt" IS NULL;

ALTER TABLE "Campaign" ALTER COLUMN "endsAt" SET NOT NULL;
