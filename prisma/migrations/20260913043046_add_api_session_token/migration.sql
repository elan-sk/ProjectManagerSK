-- AlterTable
ALTER TABLE "User" ADD COLUMN "apiSessionExpiresAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "apiSessionTokenHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_apiSessionTokenHash_key" ON "User"("apiSessionTokenHash");

