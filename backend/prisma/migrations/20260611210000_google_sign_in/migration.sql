-- Google sign-in: users created via Google have no password.
ALTER TABLE "User" ALTER COLUMN "password" DROP NOT NULL;

ALTER TABLE "User" ADD COLUMN "googleId" TEXT;

CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");
