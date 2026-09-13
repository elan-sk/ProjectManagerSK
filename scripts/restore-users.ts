import "dotenv/config";
import { readFile } from "node:fs/promises";
import { prisma } from "../src/lib/prisma";

// Recrea los usuarios exportados de la base vieja (scripts/production-users-seed.json)
// en la base que esté puesta en DATABASE_URL en ese momento — mismos
// username/passwordHash/rol/teléfono de siempre, así nadie tiene que
// resetear su contraseña por la migración. Correr DESPUÉS de aplicar las
// migraciones (npx prisma migrate deploy) contra la base nueva.
async function main() {
  const raw = await readFile("scripts/production-users-seed.json", "utf-8");
  const users = JSON.parse(raw) as Array<{
    id: string;
    name: string;
    username: string;
    email: string | null;
    passwordHash: string;
    role: "ADMIN" | "MEMBER";
    avatarUrl: string | null;
    phone: string | null;
  }>;

  for (const u of users) {
    await prisma.user.upsert({
      where: { username: u.username },
      update: {},
      create: {
        id: u.id,
        name: u.name,
        username: u.username,
        email: u.email,
        passwordHash: u.passwordHash,
        role: u.role,
        avatarUrl: u.avatarUrl,
        phone: u.phone,
      },
    });
    console.log(`Restaurado: ${u.username}`);
  }
}

main().then(() => process.exit(0));
