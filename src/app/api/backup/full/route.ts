import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const BACKUP_FORMAT = "ProjectManagerSK-full-backup";
const tableNameSchema = /^[A-Za-z0-9_]+$/;
const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(1),
  tables: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
});

type TableRow = Record<string, unknown>;

// Si hay proyectos ocultos de otro responsable, el respaldo viaja cifrado (AES-256-GCM):
// el archivo no deja leer nada de ellos. La clave es BACKUP_PASSPHRASE (variable de entorno del
// servidor; si falta, AUTH_SECRET) y nunca la conoce quien descarga. Se restaura en CUALQUIER
// parte (otro servidor o en local) con la misma clave: por variable de entorno o escribiéndola
// en el formulario de restauración. Al restaurar, la marca de oculto y el PM vuelven tal cual.
const serverPassphrase = () => process.env.BACKUP_PASSPHRASE || process.env.AUTH_SECRET || "";

function encryptBackup(plain: string) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", scryptSync(serverPassphrase(), salt, 32), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return { format: BACKUP_FORMAT, version: 1, encrypted: true, salt: salt.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") };
}

function decryptBackup(envelope: { salt?: string; iv: string; tag: string; data: string }, typedPassphrase: string) {
  // Prueba la clave escrita en el formulario y las del servidor; el respaldo inicial (sin salt) usaba solo AUTH_SECRET.
  const candidates = [typedPassphrase, process.env.BACKUP_PASSPHRASE, process.env.AUTH_SECRET].filter((c): c is string => Boolean(c));
  for (const passphrase of candidates) {
    try {
      const key = envelope.salt
        ? scryptSync(passphrase, Buffer.from(envelope.salt, "base64"), 32)
        : createHash("sha256").update(`respaldo-total:${passphrase}`).digest();
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64"));
      decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
      return Buffer.concat([decipher.update(Buffer.from(envelope.data, "base64")), decipher.final()]).toString("utf8");
    } catch {
      // clave incorrecta: se intenta la siguiente
    }
  }
  return null;
}

const encryptedSchema = z.object({ format: z.literal(BACKUP_FORMAT), encrypted: z.literal(true), salt: z.string().optional(), iv: z.string(), tag: z.string(), data: z.string() });

function identifier(name: string) {
  if (!tableNameSchema.test(name)) throw new Error("Nombre de tabla no válido en el respaldo.");
  return `\`${name}\``;
}

async function applicationTables() {
  const tables = await prisma.$queryRaw<Array<{ tableName: string }>>(
    Prisma.sql`SELECT table_name AS tableName
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_type = 'BASE TABLE'
        AND table_name <> '_prisma_migrations'
      ORDER BY table_name`,
  );
  return tables.map((entry) => entry.tableName).filter((name) => tableNameSchema.test(name));
}

function redirectToSettings(request: Request, params: Record<string, string>) {
  const url = new URL("/settings", request.url);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  // Un formulario POST debe terminar en GET: 303 evita reenviar el archivo
  // a /settings y evita el error de Server Action desactualizada.
  return NextResponse.redirect(url, 303);
}

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Solo un administrador puede crear respaldos." }, { status: 403 });
  }

  const foreignHidden = await prisma.project.count({ where: { hidden: true, pmId: { not: session.user.id } } });

  const tables = await applicationTables();
  const contents = await Promise.all(
    tables.map(async (table) => [table, await prisma.$queryRawUnsafe<TableRow[]>(`SELECT * FROM ${identifier(table)}`)] as const),
  );
  const backup = {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    tables: Object.fromEntries(contents),
  };

  const json = JSON.stringify(backup, null, 2);
  return new NextResponse(foreignHidden > 0 ? JSON.stringify(encryptBackup(json)) : json, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="projectmanagersk-respaldo-total-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return redirectToSettings(request, { backupError: "No autorizado" });
  }

  const formData = await request.formData();
  if (formData.get("confirmReplace") !== "yes") {
    return redirectToSettings(request, { backupError: "Debes confirmar el reemplazo total" });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) return redirectToSettings(request, { backupError: "Selecciona un respaldo" });

  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    return redirectToSettings(request, { backupError: "El archivo no es JSON válido" });
  }

  const encrypted = encryptedSchema.safeParse(raw);
  if (encrypted.success) {
    const typed = formData.get("passphrase");
    const plain = decryptBackup(encrypted.data, typeof typed === "string" ? typed.trim() : "");
    if (plain === null) {
      return redirectToSettings(request, { backupError: "El respaldo está cifrado: escriba la clave del respaldo (BACKUP_PASSPHRASE del servidor donde se creó) o el archivo está dañado" });
    }
    raw = JSON.parse(plain);
  }

  const parsed = backupSchema.safeParse(raw);
  if (!parsed.success) return redirectToSettings(request, { backupError: "No es un respaldo total válido" });

  const tables = await applicationTables();
  const expected = new Set(tables);
  const received = Object.keys(parsed.data.tables);
  if (received.length !== expected.size || received.some((table) => !expected.has(table))) {
    return redirectToSettings(request, {
      backupError: "El respaldo corresponde a otra estructura. Aplica primero las migraciones de esta versión.",
    });
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 0");
      try {
        for (const table of tables) await tx.$executeRawUnsafe(`DELETE FROM ${identifier(table)}`);

        for (const table of tables) {
          for (const row of parsed.data.tables[table] ?? []) {
            const columns = Object.keys(row).filter((column) => tableNameSchema.test(column));
            if (columns.length === 0) continue;
            const placeholders = columns.map(() => "?").join(", ");
            const values = columns.map((column) => row[column] ?? null);
            await tx.$executeRawUnsafe(
              `INSERT INTO ${identifier(table)} (${columns.map(identifier).join(", ")}) VALUES (${placeholders})`,
              ...values,
            );
          }
        }
      } finally {
        await tx.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 1");
      }
    }, { timeout: 60_000 });
  } catch (error) {
    console.error("No se pudo restaurar el respaldo total", error);
    return redirectToSettings(request, { backupError: "No se pudo restaurar el respaldo; no se aplicaron cambios" });
  }

  return redirectToSettings(request, { backupRestored: "1" });
}
