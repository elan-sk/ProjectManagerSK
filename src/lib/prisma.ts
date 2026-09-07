import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";

// ponytail: singleton para evitar abrir una conexión nueva en cada hot-reload
// de Next.js en desarrollo — patrón estándar recomendado por Prisma.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Prisma 7: el query engine desapareció, la conexión se hace vía adapter.
const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL! });

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
