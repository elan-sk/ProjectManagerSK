// Verifica las miniaturas de imágenes subidas: npm run verify:thumbnails
import assert from "node:assert/strict";
import { mkdtemp, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { thumbnailFile } from "../src/lib/thumbnails";
import { parseThumbWidth, thumbUrl } from "../src/lib/thumbUrl";

// Solo las imágenes raster subidas pasan a miniatura; todo lo demás queda igual.
assert.equal(thumbUrl("/uploads/abc.png", 320), "/uploads/abc.png?w=320");
assert.equal(thumbUrl("https://pmsk.depura-creatividad.com/uploads/abc.JPG", 800), "https://pmsk.depura-creatividad.com/uploads/abc.JPG?w=800");
assert.equal(thumbUrl("/uploads/abc.webp?w=800", 320), "/uploads/abc.webp?w=320");
for (const same of ["/uploads/logo.svg", "/uploads/anim.gif", "/uploads/doc.pdf", "https://i.ytimg.com/vi/x/mqdefault.jpg", "blob:http://x/1", "/icons/pm-192.png"])
  assert.equal(thumbUrl(same, 320), same);
assert.equal(thumbUrl(null, 320), null);
assert.equal(parseThumbWidth("320"), 320);
assert.equal(parseThumbWidth("999"), null);

async function main() {
  // La miniatura sale en WebP, del ancho pedido, más liviana, y la segunda vez se reusa.
  const dir = await mkdtemp(path.join(os.tmpdir(), "thumbs-"));
  const original = path.join(dir, "foto.png");
  await sharp({ create: { width: 2400, height: 1600, channels: 3, background: "#3a7" } }).png().toFile(original);
  const thumb = await thumbnailFile(original, "foto.png", 320, dir);
  const meta = await sharp(thumb).metadata();
  assert.equal(meta.format, "webp");
  assert.equal(meta.width, 320);
  assert.ok((await stat(thumb)).size < (await stat(original)).size);
  assert.equal(await thumbnailFile(original, "foto.png", 320, dir), thumb);

  // Una imagen más chica que el ancho pedido no se agranda.
  const small = path.join(dir, "chica.png");
  await sharp({ create: { width: 200, height: 100, channels: 3, background: "#000" } }).png().toFile(small);
  assert.equal((await sharp(await thumbnailFile(small, "chica.png", 800, dir)).metadata()).width, 200);

  console.log("OK miniaturas");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
