-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('Unverified', 'Pending', 'Verified', 'Rejected');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "kycStatus" "KycStatus" NOT NULL DEFAULT 'Unverified';
ALTER TABLE "User" ADD COLUMN "kycDocumentUrl" TEXT;
ALTER TABLE "User" ADD COLUMN "kycSubmittedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "kycReviewedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "kycReviewedByAdminId" TEXT;
ALTER TABLE "User" ADD COLUMN "kycNotes" TEXT;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_kycReviewedByAdminId_fkey" FOREIGN KEY ("kycReviewedByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill from existing campaign verification documents.
-- Organizers with an approved/live/closed campaign that had an ID → Verified (so payouts are not blocked).
-- Others with a document on file → Pending.
WITH latest_doc AS (
  SELECT DISTINCT ON ("creatorId")
    "creatorId",
    "verificationDocumentUrl",
    "createdAt"
  FROM "Campaign"
  WHERE "creatorId" IS NOT NULL
    AND "verificationDocumentUrl" IS NOT NULL
  ORDER BY "creatorId", "createdAt" DESC
),
approved AS (
  SELECT DISTINCT "creatorId"
  FROM "Campaign"
  WHERE "creatorId" IS NOT NULL
    AND "verificationDocumentUrl" IS NOT NULL
    AND status IN ('Active', 'Ended', 'Closed')
)
UPDATE "User" u
SET
  "kycDocumentUrl" = ld."verificationDocumentUrl",
  "kycSubmittedAt" = ld."createdAt",
  "kycStatus" = CASE
    WHEN a."creatorId" IS NOT NULL THEN 'Verified'::"KycStatus"
    ELSE 'Pending'::"KycStatus"
  END,
  "kycReviewedAt" = CASE
    WHEN a."creatorId" IS NOT NULL THEN NOW()
    ELSE NULL
  END
FROM latest_doc ld
LEFT JOIN approved a ON a."creatorId" = ld."creatorId"
WHERE u.id = ld."creatorId";
