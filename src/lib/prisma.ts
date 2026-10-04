import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";

// ponytail: singleton para evitar abrir una conexión nueva en cada hot-reload
// de Next.js en desarrollo — patrón estándar recomendado por Prisma.
const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createClient> };

// Prisma 7: el query engine desapareció, la conexión se hace vía adapter.
// El adaptador de MariaDB (mismo driver para MySQL, el que trae el hosting
// de Hostinger) no acepta la cadena de conexión completa de un tirón —hay
// que parsearla en sus partes. Formato esperado de DATABASE_URL:
// mysql://usuario:contraseña@host:puerto/basededatos
const dbUrl = new URL(process.env.DATABASE_URL!);
const adapter = new PrismaMariaDb({
  host: dbUrl.hostname,
  port: dbUrl.port ? Number(dbUrl.port) : 3306,
  user: decodeURIComponent(dbUrl.username),
  password: decodeURIComponent(dbUrl.password),
  database: dbUrl.pathname.replace(/^\//, ""),
});

// Seguridad: los hashes de contraseña y de tokens, el teléfono y el correo NUNCA salen
// en una consulta salvo que se pidan a propósito (omit: { phone: false } o select). Así
// un `include: { user: true }` que termina en un componente del navegador no filtra
// credenciales ni datos personales de todo el equipo.
const OMIT_SECRETS = { user: { passwordHash: true, resetTokenHash: true, apiSessionTokenHash: true, phone: true, email: true } } as const;
const createClient = () => new PrismaClient({ adapter, omit: OMIT_SECRETS });

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
