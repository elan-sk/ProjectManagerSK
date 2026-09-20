import { constants as fsConstants } from "node:fs";
import { copyFile, lstat, mkdir, readdir, realpath, rename, rm, symlink } from "node:fs/promises";
import path from "node:path";

// Punto confirmado con el usuario (reportado con capturas: el ícono del
// proyecto y un .docx dejaron de verse SOLO en producción): Hostinger activa
// cada deploy en una carpeta de versión NUEVA (hbuilds/versions/<uuid>/) sin
// heredar nada de la anterior. Un archivo subido (ver uploadFile.ts, escribe
// en public/uploads/ del propio checkout) vive DENTRO de esa carpeta de
// versión — el próximo deploy activa otra carpeta nueva y ese archivo queda
// huérfano, invisible.
//
// Esto convierte public/uploads en un symlink hacia una carpeta FIJA fuera del
// árbol de versiones — el mismo directorio real sobrevive entre deploys, sin
// tocar nada del proceso de build de Hostinger (que no admite pasos propios).
//
// Qué carpeta fija se usa:
//   1. PERSISTENT_UPLOADS_DIR, si está definida (manda siempre).
//   2. Si no, y la app corre dentro de ~/domains/<sitio>/hbuilds/versions/<uuid>
//      (así despliega Hostinger), <sitio>/public_html/uploads: la raíz pública
//      del sitio, que NO es una carpeta de versión (el deploy no la borra) y sí
//      entra en los respaldos de hPanel. NO hace falta configurar nada.
//   3. En cualquier otro caso (dev local) no hace nada: uploads sigue siendo
//      la carpeta común y corriente del propio checkout.
//
// Además, cuando conoce <sitio>, COPIA (nunca mueve ni borra) a esa carpeta
// fija los archivos que quedaron en las carpetas de versiones anteriores: así
// las imágenes que "se perdieron" en un deploy previo reaparecen solas.

// La app corre en <sitio>/hbuilds/versions/<uuid>: devuelve <sitio>, o null.
function siteRootOf(dir: string): string | null {
  const match = dir.match(/^(.*)[\\/]hbuilds[\\/]versions[\\/][^\\/]+/);
  return match ? match[1] : null;
}

// Carpeta permanente por defecto (ver arriba). Las carpetas usadas antes
// (<sitio>/persistent-uploads) siguen siendo fuente de archivos.
const defaultTarget = (siteRoot: string) => path.join(siteRoot, "public_html", "uploads");
const legacyDir = (siteRoot: string) => path.join(siteRoot, "persistent-uploads");

// Copia a `target` los archivos de public/uploads de las OTRAS versiones. No
// pisa nada existente (COPYFILE_EXCL) y no toca las carpetas de origen.
async function importFromOtherVersions(siteRoot: string, target: string) {
  const versionsDir = path.join(siteRoot, "hbuilds", "versions");
  const versions = await readdir(versionsDir).catch(() => [] as string[]);
  const sources = versions.map((v) => path.join(versionsDir, v, "public", "uploads"));
  if (legacyDir(siteRoot) !== target) sources.push(legacyDir(siteRoot));
  let copied = 0;
  for (const dir of sources) {
    const stat = await lstat(dir).catch(() => null);
    // lstat no sigue enlaces: una versión que ya apunta a la carpeta fija no es fuente.
    if (!stat?.isDirectory()) continue;
    for (const name of await readdir(dir).catch(() => [] as string[])) {
      if (name === ".gitkeep") continue;
      const source = path.join(dir, name);
      if (!(await lstat(source).catch(() => null))?.isFile()) continue;
      try {
        await copyFile(source, path.join(target, name), fsConstants.COPYFILE_EXCL);
        copied += 1;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "EEXIST") console.error(`[persistentUploads] no se pudo copiar "${name}"`, err);
      }
    }
  }
  if (copied > 0) console.log(`[persistentUploads] ${copied} archivo(s) recuperado(s) de versiones anteriores → ${target}`);
}

// Dónde está el sitio y cuál es la carpeta permanente (ver la explicación de arriba).
async function locate(cwd: string) {
  const realCwd = await realpath(cwd).catch(() => cwd);
  const siteRoot = siteRootOf(realCwd);
  const target = process.env.PERSISTENT_UPLOADS_DIR || (siteRoot ? defaultTarget(siteRoot) : undefined);
  return { realCwd, siteRoot, target };
}

/**
 * Carpetas donde buscar un archivo subido, en orden: la permanente, la de esta
 * versión y las de las versiones anteriores. Lo usa la ruta /uploads/[name]
 * para servir cada archivo leyendo el disco en el momento de la petición —
 * sin depender de la lista de public/ que Next arma UNA vez al arrancar (un
 * archivo copiado o subido después de ese momento daba 404).
 */
export async function uploadSearchDirs(cwd: string = process.cwd()): Promise<string[]> {
  const { siteRoot, target } = await locate(cwd);
  const dirs: string[] = [];
  if (target) dirs.push(target);
  dirs.push(path.join(cwd, "public", "uploads"));
  if (siteRoot) {
    const versionsDir = path.join(siteRoot, "hbuilds", "versions");
    for (const version of await readdir(versionsDir).catch(() => [] as string[])) dirs.push(path.join(versionsDir, version, "public", "uploads"));
    if (legacyDir(siteRoot) !== target) dirs.push(legacyDir(siteRoot));
  }
  return dirs;
}

export async function ensurePersistentUploads(cwd: string = process.cwd()) {
  const { realCwd, siteRoot, target } = await locate(cwd);
  if (!target) {
    // Sin carpeta fija, avatares/íconos/adjuntos viven dentro de la carpeta de
    // versión del deploy y desaparecen en el siguiente — que quede a la vista
    // en el log de producción en vez de descubrirlo por un avatar roto.
    if (process.env.NODE_ENV === "production") {
      console.warn(
        `[persistentUploads] No hay carpeta permanente para los archivos subidos (PERSISTENT_UPLOADS_DIR sin definir y la app no corre dentro de hbuilds/versions; cwd=${realCwd}): se perderán en el próximo deploy.`
      );
    }
    return;
  }

  const uploadsPath = path.join(cwd, "public/uploads");

  try {
    await mkdir(target, { recursive: true });

    const stat = await lstat(uploadsPath).catch(() => null);
    if (!stat?.isSymbolicLink()) {
      if (stat?.isDirectory()) {
        // Rescata lo que ya esté ahí (ej. primer deploy con esto activado, o
        // archivos subidos en ESTA versión antes de que corriera este código)
        // antes de reemplazar la carpeta por el symlink — nunca se pisa nada.
        const entries = await readdir(uploadsPath);
        for (const entry of entries) {
          if (entry === ".gitkeep") continue;
          await rename(path.join(uploadsPath, entry), path.join(target, entry)).catch((err) =>
            console.error(`[persistentUploads] no se pudo rescatar "${entry}"`, err)
          );
        }
        await rm(uploadsPath, { recursive: true, force: true });
      }
      await symlink(target, uploadsPath, "dir");
      console.log(`[persistentUploads] public/uploads -> ${target}`);
    }

    // Aunque el enlace ya exista, se revisan las versiones anteriores (es idempotente).
    if (siteRoot) await importFromOtherVersions(siteRoot, target);
  } catch (err) {
    // Nunca debe tumbar el arranque del server por esto (mismo criterio que
    // el resto de instrumentation.ts) — si falla, uploads sigue funcionando
    // igual que antes (efímero dentro de esta versión), solo que sin
    // sobrevivir al próximo deploy.
    console.error("[persistentUploads] no se pudo enlazar el storage persistente", err);
  }
}
