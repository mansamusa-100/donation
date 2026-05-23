-- Campaign lifecycle: Ended status, owner confirmation, extension requests

CREATE TYPE "CampaignExtensionStatus" AS ENUM ('Pending', 'Approved', 'Rejected');

ALTER TYPE "CampaignStatus" ADD VALUE 'Ended';

ALTER TABLE "Campaign" ADD COLUMN "ownerConfirmedEndAt" TIMESTAMP(3);
ALTER TABLE "Campaign" ADD COLUMN "endedAt" TIMESTAMP(3);

CREATE TABLE "CampaignExtensionRequest" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "requestedEndDate" TEXT NOT NULL,
    "requestedEndsAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "status" "CampaignExtensionStatus" NOT NULL DEFAULT 'Pending',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignExtensionRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CampaignExtensionRequest_campaignId_status_idx" ON "CampaignExtensionRequest"("campaignId", "status");
CREATE INDEX "CampaignExtensionRequest_status_createdAt_idx" ON "CampaignExtensionRequest"("status", "createdAt");

ALTER TABLE "CampaignExtensionRequest" ADD CONSTRAINT "CampaignExtensionRequest_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignExtensionRequest" ADD CONSTRAINT "CampaignExtensionRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignExtensionRequest" ADD CONSTRAINT "CampaignExtensionRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
