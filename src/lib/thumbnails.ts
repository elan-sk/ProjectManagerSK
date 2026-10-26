import { access, mkdir, rename } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { uploadWriteDir } from "@/lib/persistentUploads";
import type { ThumbWidth } from "@/lib/thumbUrl";

/**
 * Ruta en disco de la miniatura WebP de una imagen subida; la crea la primera vez y después la reusa.
 * Vive en <carpeta de subidas>/.thumbs. Los nombres de archivo son la huella del contenido, así que nunca queda vieja.
 */
export async function thumbnailFile(original: string, name: string, width: ThumbWidth, dir?: string) {
  const thumbsDir = path.join(dir ?? (await uploadWriteDir()), ".thumbs");
  const target = path.join(thumbsDir, `${name}-w${width}.webp`);
  if (await access(target).then(() => true, () => false)) return target;
  await mkdir(thumbsDir, { recursive: true });
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await sharp(original).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 75 }).toFile(tmp);
  await rename(tmp, target);
  return target;
}
