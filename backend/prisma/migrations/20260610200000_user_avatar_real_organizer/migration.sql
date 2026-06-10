-- Organizers use their own profile pictures; no more demo avatars.
ALTER TABLE "User" ADD COLUMN "avatarUrl" TEXT;

ALTER TABLE "Campaign" ALTER COLUMN "creatorAvatar" DROP NOT NULL;

-- Clear demo/placeholder organizer avatars left over from before going live.
UPDATE "Campaign"
SET "creatorAvatar" = NULL
WHERE "creatorAvatar" LIKE '%unsplash.com%'
   OR "creatorAvatar" LIKE '%pravatar%'
   OR "creatorAvatar" LIKE '%placeholder%';
