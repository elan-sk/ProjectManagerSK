import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, open, readdir, rename, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { ZipArchive, type ZipEntryData } from "archiver";
import unzipper from "unzipper";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { uploadWriteDir } from "@/lib/persistentUploads";

const BACKUP_FORMAT = "ProjectManagerSK-full-backup";
const tableNameSchema = /^[A-Za-z0-9_]+$/;
const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(1),
  tables: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
});

type TableRow = Record<string, unknown>;

// El respaldo es un .zip: respaldo.json (la base) + uploads/<nombre> (los archivos subidos, con el mismo
// nombre con que la base los referencia: restaurarlos es copiarlos de vuelta, sin reescribir nada).
// Con proyectos ocultos ajenos, el zip entero va cifrado (AES-256-GCM en flujo):
//   MAGIC (8) + salt (16) + iv (12) + cifrado… + tag (16).
// También se siguen aceptando los respaldos viejos, que eran solo el .json (cifrado o no).
const ZIP_JSON = "respaldo.json";
const ZIP_UPLOADS = "uploads/";
const ENC_MAGIC = Buffer.from("PMSKBK2\n");
const ENC_HEADER = ENC_MAGIC.length + 16 + 12;
const ENC_TAG = 16;
const UPLOAD_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

// Si hay proyectos ocultos de otro responsable, el respaldo viaja cifrado (AES-256-GCM):
// el archivo no deja leer nada de ellos. La clave es BACKUP_PASSPHRASE (variable de entorno del
// servidor; si falta, AUTH_SECRET) y nunca la conoce quien descarga. Se restaura en CUALQUIER
// parte (otro servidor o en local) con la misma clave: por variable de entorno o escribiéndola
// en el formulario de restauración. Al restaurar, la marca de oculto y el PM vuelven tal cual.
const serverPassphrase = () => process.env.BACKUP_PASSPHRASE || process.env.AUTH_SECRET || "";

const passphraseCandidates = (typed: string) => [typed, process.env.BACKUP_PASSPHRASE, process.env.AUTH_SECRET].filter((c): c is string => Boolean(c));

/** Cifra en flujo (el zip puede pesar cientos de MB: no se carga entero en memoria). */
async function* encryptStream(source: AsyncIterable<Buffer>) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", scryptSync(serverPassphrase(), salt, 32), iv);
  yield Buffer.concat([ENC_MAGIC, salt, iv]);
  for await (const chunk of source) yield cipher.update(chunk);
  yield cipher.final();
  yield cipher.getAuthTag();
}

/** Descifra `src` (zip cifrado) a `dest` probando las claves posibles; false si ninguna sirve o el archivo está dañado. */
async function decryptZip(src: string, dest: string, typedPassphrase: string) {
  const { size } = await stat(src);
  if (size < ENC_HEADER + ENC_TAG) return false;
  const handle = await open(src, "r");
  const header = Buffer.alloc(ENC_HEADER);
  const tag = Buffer.alloc(ENC_TAG);
  try {
    await handle.read(header, 0, ENC_HEADER, 0);
    await handle.read(tag, 0, ENC_TAG, size - ENC_TAG);
  } finally {
    await handle.close();
  }
  const salt = header.subarray(ENC_MAGIC.length, ENC_MAGIC.length + 16);
  const iv = header.subarray(ENC_MAGIC.length + 16);
  for (const passphrase of passphraseCandidates(typedPassphrase)) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", scryptSync(passphrase, salt, 32), iv);
      decipher.setAuthTag(tag);
      await pipeline(createReadStream(src, { start: ENC_HEADER, end: size - ENC_TAG - 1 }), decipher, createWriteStream(dest));
      return true;
    } catch {
      // clave incorrecta: se intenta la siguiente
    }
  }
  return false;
}

function decryptBackup(envelope: { salt?: string; iv: string; tag: string; data: string }, typedPassphrase: string) {
  // Prueba la clave escrita en el formulario y las del servidor; el respaldo inicial (sin salt) usaba solo AUTH_SECRET.
  for (const passphrase of passphraseCandidates(typedPassphrase)) {
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

export async function GET(request: Request) {
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

  const uploadsDir = await uploadWriteDir();
  const withFiles = new URL(request.url).searchParams.get("files") !== "0";
  const names = (withFiles ? await readdir(uploadsDir, { withFileTypes: true }).catch(() => []) : [])
    .filter((entry) => entry.isFile() && UPLOAD_NAME.test(entry.name))
    .map((entry) => entry.name);

  // Los archivos subidos ya vienen comprimidos (png, pdf…): se guardan sin recomprimir.
  const archive = new ZipArchive({ zlib: { level: 6 } });
  archive.append(JSON.stringify(backup, null, 2), { name: ZIP_JSON });
  for (const name of names) {
    // Los tipos de archiver.file() no declaran `store`, pero el plugin zip sí lo respeta.
    const data: ZipEntryData = { name: `${ZIP_UPLOADS}${name}`, store: true };
    archive.file(path.join(uploadsDir, name), data);
  }
  void archive.finalize();

  const encrypted = foreignHidden > 0;
  const source = encrypted ? Readable.from(encryptStream(archive)) : archive;
  return new NextResponse(Readable.toWeb(source) as ReadableStream, {
    headers: {
      "Content-Type": encrypted ? "application/octet-stream" : "application/zip",
      "Content-Disposition": `attachment; filename="projectmanagersk-respaldo-total-${new Date().toISOString().slice(0, 10)}.zip${encrypted ? ".cifrado" : ""}"`,
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

  const tmp = await mkdtemp(path.join(tmpdir(), "pmsk-restore-"));
  try {
    const typed = formData.get("passphrase");
    return await restore(request, file, typeof typed === "string" ? typed.trim() : "", tmp);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

async function restore(request: Request, file: File, typedPassphrase: string, tmp: string) {
  const head = Buffer.from(await file.slice(0, ENC_MAGIC.length).arrayBuffer());
  const isEncryptedZip = head.equals(ENC_MAGIC);
  const isZip = isEncryptedZip || head.subarray(0, 2).toString() === "PK";

  let raw: unknown;
  let upload: { entry: unzipper.File; name: string }[] = [];
  if (isZip) {
    // ponytail: request.formData() deja el archivo en memoria; con respaldos de varios GB habría que leer el cuerpo en flujo.
    const received = path.join(tmp, "received");
    await pipeline(Readable.fromWeb(file.stream() as Parameters<typeof Readable.fromWeb>[0]), createWriteStream(received));
    let zipPath = received;
    if (isEncryptedZip) {
      zipPath = path.join(tmp, "plain.zip");
      if (!(await decryptZip(received, zipPath, typedPassphrase))) {
        return redirectToSettings(request, { backupError: "El respaldo está cifrado: escriba la clave del respaldo (BACKUP_PASSPHRASE del servidor donde se creó) o el archivo está dañado" });
      }
    }
    try {
      const directory = await unzipper.Open.file(zipPath);
      const json = directory.files.find((entry) => entry.path === ZIP_JSON);
      if (!json) return redirectToSettings(request, { backupError: "No es un respaldo total válido" });
      raw = JSON.parse((await json.buffer()).toString("utf8"));
      upload = directory.files
        .filter((entry) => entry.type === "File" && entry.path.startsWith(ZIP_UPLOADS))
        .map((entry) => ({ entry, name: entry.path.slice(ZIP_UPLOADS.length) }))
        .filter(({ name }) => UPLOAD_NAME.test(name));
    } catch {
      return redirectToSettings(request, { backupError: "El archivo no es un respaldo válido o está dañado" });
    }
  } else {
    try {
      raw = JSON.parse(await file.text());
    } catch {
      return redirectToSettings(request, { backupError: "El archivo no es JSON válido" });
    }
    const encrypted = encryptedSchema.safeParse(raw);
    if (encrypted.success) {
      const plain = decryptBackup(encrypted.data, typedPassphrase);
      if (plain === null) {
        return redirectToSettings(request, { backupError: "El respaldo está cifrado: escriba la clave del respaldo (BACKUP_PASSPHRASE del servidor donde se creó) o el archivo está dañado" });
      }
      raw = JSON.parse(plain);
    }
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

  // Archivos primero: solo se agregan (nunca se borra ni se pisa nada: el nombre es la huella del contenido),
  // así que si la base falla después no queda nada roto.
  try {
    const dir = await uploadWriteDir();
    for (const { entry, name } of upload) {
      if (await stat(path.join(dir, name)).catch(() => null)) continue;
      const partial = path.join(dir, `.${name}.part`);
      await pipeline(entry.stream(), createWriteStream(partial));
      await rename(partial, path.join(dir, name));
    }
  } catch (error) {
    console.error("No se pudieron restaurar los archivos del respaldo", error);
    return redirectToSettings(request, { backupError: "No se pudieron restaurar los archivos; no se aplicaron cambios en la base" });
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
