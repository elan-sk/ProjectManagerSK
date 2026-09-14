import { lstat, mkdir, readdir, rename, rm, symlink } from "node:fs/promises";
import path from "node:path";

// Punto confirmado con el usuario (reportado con capturas: el ícono del
// proyecto y un .docx dejaron de verse SOLO en producción): Hostinger activa
// cada deploy en una carpeta de versión NUEVA (hbuilds/versions/<uuid>/) sin
// heredar nada de la anterior. Un archivo subido (ver uploadFile.ts, escribe
// en public/uploads/ del propio checkout) vive DENTRO de esa carpeta de
// versión — el próximo deploy activa otra carpeta nueva y ese archivo queda
// huérfano, invisible.
//
// Esto convierte public/uploads en un symlink hacia PERSISTENT_UPLOADS_DIR,
// una carpeta FIJA fuera del árbol de versiones (ver deploy-hostinger skill
// para cómo crearla) — el mismo directorio real sobrevive entre deploys, sin
// tocar nada del proceso de build de Hostinger (que no admite pasos propios).
// Sin esa env var (dev local, o mientras no se configure) no hace nada:
// uploads sigue siendo la carpeta común y corriente del propio checkout.
export async function ensurePersistentUploads() {
  const target = process.env.PERSISTENT_UPLOADS_DIR;
  if (!target) return;

  const uploadsPath = path.join(process.cwd(), "public/uploads");

  try {
    await mkdir(target, { recursive: true });

    const stat = await lstat(uploadsPath).catch(() => null);
    if (stat?.isSymbolicLink()) return; // ya migrado en un deploy anterior

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
  } catch (err) {
    // Nunca debe tumbar el arranque del server por esto (mismo criterio que
    // el resto de instrumentation.ts) — si falla, uploads sigue funcionando
    // igual que antes (efímero dentro de esta versión), solo que sin
    // sobrevivir al próximo deploy.
    console.error("[persistentUploads] no se pudo enlazar el storage persistente", err);
  }
}
