-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN "showPublicContact" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Campaign" ADD COLUMN "contactPhone" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "contactWhatsApp" TEXT;
