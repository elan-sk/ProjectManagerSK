-- AlterTable
ALTER TABLE "User" ADD COLUMN "resetTokenExpiresAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "resetTokenHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_resetTokenHash_key" ON "User"("resetTokenHash");

