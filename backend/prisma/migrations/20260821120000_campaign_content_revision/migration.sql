-- CreateEnum
CREATE TYPE "CampaignContentRevisionStatus" AS ENUM ('Pending', 'Approved', 'Rejected');

-- CreateTable
CREATE TABLE "CampaignContentRevision" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "shortDescription" TEXT NOT NULL,
    "fullDescription" TEXT NOT NULL,
    "category" "Category" NOT NULL,
    "goalAmount" INTEGER NOT NULL,
    "coverImage" TEXT NOT NULL,
    "galleryImages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reason" TEXT,
    "status" "CampaignContentRevisionStatus" NOT NULL DEFAULT 'Pending',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignContentRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampaignContentRevision_campaignId_status_idx" ON "CampaignContentRevision"("campaignId", "status");

-- CreateIndex
CREATE INDEX "CampaignContentRevision_status_createdAt_idx" ON "CampaignContentRevision"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "CampaignContentRevision" ADD CONSTRAINT "CampaignContentRevision_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignContentRevision" ADD CONSTRAINT "CampaignContentRevision_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignContentRevision" ADD CONSTRAINT "CampaignContentRevision_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
