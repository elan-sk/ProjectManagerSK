import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { findUploadPath, uploadWriteDir } from "@/lib/persistentUploads";
import { contentFileName, isContentFileName } from "@/lib/uploadFile";
import { EXACT_REFS, TEXT_REFS, countFileReferences, table } from "@/lib/fileReferences";
import { logger } from "@/lib/logger";

/**
 * Spec 001 (RF-11 a RF-14): unifica los archivos subidos antes de que el nombre
 * fuera la huella del contenido. Parte de la BASE (no del disco): toma cada
 * dirección /uploads/<nombre viejo> referenciada, le calcula la huella, deja la
 * copia por contenido, reescribe todas sus referencias y aparta el archivo
 * viejo en `_unificados-AAAA-MM-DD/` (nunca lo borra). Repetible: una segunda
 * corrida ya no encuentra nombres viejos. Lo que falta en disco se informa y
 * no se toca. Corre al arrancar (instrumentation.ts), en segundo plano.
 */
const UPLOAD_URL = /\/uploads\/[A-Za-z0-9][A-Za-z0-9._-]*/g;
const nameOf = (url: string) => url.slice("/uploads/".length);
const isOldUploadUrl = (url: string) => /^\/uploads\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(url) && !isContentFileName(nameOf(url));

export type UnifySummary = { reviewed: number; unified: number; duplicates: number; referencesUpdated: number; bytesFreed: number; missing: string[]; moved: number };

let running = false;

export async function unifyUploads(): Promise<UnifySummary | null> {
  if (running) return null;
  running = true;
  try {
    return await run();
  } finally {
    running = false;
  }
}

async function run(): Promise<UnifySummary> {
  const summary: UnifySummary = { reviewed: 0, unified: 0, duplicates: 0, referencesUpdated: 0, bytesFreed: 0, missing: [], moved: 0 };

  // 1. Direcciones viejas referenciadas en la base.
  const oldUrls = new Set<string>();
  for (const [model, field] of EXACT_REFS) {
    for (const row of await table(model).findMany({ select: { [field]: true } })) {
      const v = row[field];
      if (v && isOldUploadUrl(v)) oldUrls.add(v);
    }
  }
  for (const [model, field] of TEXT_REFS) {
    for (const row of await table(model).findMany({ select: { [field]: true } })) {
      for (const m of row[field]?.match(UPLOAD_URL) ?? []) if (isOldUploadUrl(m)) oldUrls.add(m);
    }
  }
  if (oldUrls.size === 0) return summary;

  // 2. Copia por contenido de cada una → mapa viejo → nuevo.
  const writeDir = await uploadWriteDir();
  await mkdir(writeDir, { recursive: true });
  const mapping = new Map<string, string>();
  const sources = new Map<string, { file: string; size: number }>();
  for (const url of oldUrls) {
    summary.reviewed++;
    const file = await findUploadPath(url);
    if (!file) {
      summary.missing.push(url);
      continue;
    }
    const buffer = await readFile(file);
    const newName = contentFileName(buffer, path.extname(file));
    const target = path.join(writeDir, newName);
    const existed = await access(target).then(() => true, () => false);
    if (existed) summary.duplicates++;
    else await writeFile(target, buffer);
    mapping.set(url, `/uploads/${newName}`);
    sources.set(url, { file, size: buffer.length });
  }
  summary.unified = mapping.size;

  // 3. Reescribir referencias (solo las filas que cambian).
  const replaceAll = (text: string) => text.replace(UPLOAD_URL, (m) => mapping.get(m) ?? m);
  for (const [model, field] of EXACT_REFS) {
    for (const row of await table(model).findMany({ select: { id: true, [field]: true } })) {
      const v = row[field];
      const next = v ? mapping.get(v) : undefined;
      if (next) {
        await table(model).update({ where: { id: row.id! }, data: { [field]: next } });
        summary.referencesUpdated++;
      }
    }
  }
  for (const [model, field] of TEXT_REFS) {
    for (const row of await table(model).findMany({ select: { id: true, [field]: true } })) {
      const v = row[field];
      if (!v) continue;
      const next = replaceAll(v);
      if (next !== v) {
        await table(model).update({ where: { id: row.id! }, data: { [field]: next } });
        summary.referencesUpdated++;
      }
    }
  }

  // 4. Apartar los archivos viejos que ya nadie usa (solo los de la carpeta de escritura; nunca se borran).
  const backupDir = path.join(writeDir, `_unificados-${new Date().toISOString().slice(0, 10)}`);
  for (const [url, { file, size }] of sources) {
    if (path.dirname(file) !== writeDir) continue; // copias de versiones viejas: se dejan donde están
    if (path.basename(file) === nameOf(mapping.get(url)!)) continue;
    if ((await countFileReferences(url)) > 0) continue;
    await mkdir(backupDir, { recursive: true });
    await rename(file, path.join(backupDir, path.basename(file)));
    summary.moved++;
    summary.bytesFreed += size;
  }

  logger.info("unificacion", "Archivos repetidos unificados", {
    revisados: summary.reviewed,
    unificados: summary.unified,
    yaExistianIguales: summary.duplicates,
    referenciasActualizadas: summary.referencesUpdated,
    apartados: summary.moved,
    // Apartados, no borrados: el espacio se recupera al borrar la carpeta _unificados-… a mano.
    espacioRecuperableMB: Math.round((summary.bytesFreed / 1024 / 1024) * 10) / 10,
    faltantes: summary.missing,
  });
  return summary;
}
