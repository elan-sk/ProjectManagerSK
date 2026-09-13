-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "avatarUrl" TEXT,
    "phone" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resetTokenHash" TEXT,
    "resetTokenExpiresAt" DATETIME
);
INSERT INTO "new_User" ("avatarUrl", "createdAt", "email", "id", "name", "passwordHash", "phone", "resetTokenExpiresAt", "resetTokenHash", "role", "username") SELECT "avatarUrl", "createdAt", "email", "id", "name", "passwordHash", "phone", "resetTokenExpiresAt", "resetTokenHash", "role", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_resetTokenHash_key" ON "User"("resetTokenHash");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

