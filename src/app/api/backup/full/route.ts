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

  // El respaldo total lleva TODA la base: si hay proyectos ocultos de otro responsable, no se puede generar sin exponerlos.
  const foreignHidden = await prisma.project.count({ where: { hidden: true, pmId: { not: session.user.id } } });
  if (foreignHidden > 0) {
    return NextResponse.json({ error: "Hay proyectos ocultos de otro responsable; el respaldo total solo puede hacerlo el responsable de todos ellos." }, { status: 403 });
  }

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

  return new NextResponse(JSON.stringify(backup, null, 2), {
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
