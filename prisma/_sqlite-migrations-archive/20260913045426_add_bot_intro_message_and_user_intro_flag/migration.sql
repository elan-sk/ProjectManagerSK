-- AlterTable
ALTER TABLE "AppSetting" ADD COLUMN "botIntroMessage" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "whatsappIntroducedAt" DATETIME;
