-- CreateEnum
CREATE TYPE "Category" AS ENUM ('Medical', 'Education', 'Business', 'Community', 'Emergency', 'Other');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('GMD', 'USD');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('Draft', 'PendingReview', 'Active', 'Closed');

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "creatorName" TEXT NOT NULL,
    "creatorAvatar" TEXT NOT NULL,
    "category" "Category" NOT NULL,
    "shortDescription" TEXT NOT NULL,
    "fullDescription" TEXT NOT NULL,
    "goalAmount" INTEGER NOT NULL,
    "raisedAmount" INTEGER NOT NULL DEFAULT 0,
    "donorCount" INTEGER NOT NULL DEFAULT 0,
    "daysLeft" INTEGER NOT NULL,
    "coverImage" TEXT NOT NULL,
    "isTrending" BOOLEAN NOT NULL DEFAULT false,
    "status" "CampaignStatus" NOT NULL DEFAULT 'Active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Donation" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "donorName" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'GMD',
    "message" TEXT,
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Donation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformStat" (
    "id" TEXT NOT NULL DEFAULT 'platform',
    "totalRaised" INTEGER NOT NULL,
    "campaignsFunded" INTEGER NOT NULL,
    "totalDonors" INTEGER NOT NULL,
    "communitiesHelped" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_slug_key" ON "Campaign"("slug");

-- CreateIndex
CREATE INDEX "Donation_campaignId_createdAt_idx" ON "Donation"("campaignId", "createdAt");

-- AddForeignKey
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
