import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

// ponytail: seed mínimo — solo tu cuenta admin, sin datos de proyecto de
// ejemplo (no hay negocio ficticio que inventar en una herramienta interna).
async function main() {
  const email = "ecovia2@gmail.com";
  const passwordHash = await bcrypt.hash("cambiar-esta-clave", 10);

  await prisma.user.upsert({
    where: { email },
    update: {},
    create: { name: "Elan", email, passwordHash, role: "ADMIN" },
  });

  console.log(`Usuario admin listo: ${email} / cambiar-esta-clave (cambiala tras el primer login)`);
}

main().finally(() => prisma.$disconnect());
