// Deja un HTML en UN solo archivo antes de subirlo a PMSK: incrusta las imágenes, los .css y los .js
// locales que referencia con rutas relativas. Al subirlo solo viaja el .html (y la app lo renombra),
// así que una ruta como "img/foto.png" o "js/app.js" no se encontraría en el servidor ni en el link
// compartido. Las direcciones de internet (https://, //) y los data: quedan intactos.
//
// Uso: npx tsx scripts/incrustar-html.mts entrada.html [salida.html]
//      (sin salida: <nombre>.incrustado.html junto al original; el original no se toca)
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const IMAGE_MIME: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
  ".svg": "image/svg+xml", ".avif": "image/avif", ".ico": "image/x-icon", ".bmp": "image/bmp",
};
const MAX_BYTES = 20 * 1024 * 1024; // mismo límite de subida de la app

const [input, outputArg] = process.argv.slice(2);
if (!input) {
  console.error("Uso: npx tsx scripts/incrustar-html.mts entrada.html [salida.html]");
  process.exit(1);
}
const output = outputArg ?? input.replace(/\.html?$/i, "") + ".incrustado.html";

const missing: string[] = [];
const counts = { imagenes: 0, css: 0, js: 0 };

/** Ruta absoluta de una referencia local, o null si es externa o ya está incrustada. */
function localPath(ref: string, baseDir: string) {
  const clean = decodeURIComponent(ref.split("#")[0].split("?")[0].trim());
  if (!clean || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(clean)) return null;
  const file = path.resolve(baseDir, clean.replace(/^\//, ""));
  if (!existsSync(file) || !statSync(file).isFile()) {
    missing.push(ref);
    return null;
  }
  return file;
}

function imageDataUri(ref: string, baseDir: string) {
  const mime = IMAGE_MIME[path.extname(ref.split(/[?#]/)[0]).toLowerCase()];
  if (!mime) return null;
  const file = localPath(ref, baseDir);
  if (!file) return null;
  counts.imagenes++;
  return `data:${mime};base64,${readFileSync(file).toString("base64")}`;
}

/** url(...) dentro de CSS: relativas al archivo donde está ese CSS (el .html o el .css externo). */
function inlineCssUrls(css: string, baseDir: string) {
  return css.replace(/url\(\s*(["']?)([^)"']+)\1\s*\)/gi, (match, _q, ref) => {
    const data = imageDataUri(ref, baseDir);
    return data ? `url("${data}")` : match;
  });
}

// "</script" o "</style" dentro del contenido cerraría la etiqueta antes de tiempo.
const safeInline = (text: string, tag: string) => text.replace(new RegExp(`</${tag}`, "gi"), `<\\/${tag}`);

const htmlPath = path.resolve(input);
const baseDir = path.dirname(htmlPath);
let html = readFileSync(htmlPath, "utf8");

// 1) <link rel="stylesheet" href="local.css"> → <style> con su contenido (y sus url() incrustadas).
html = html.replace(/<link\b[^>]*>/gi, (tag) => {
  if (!/\brel\s*=\s*["']?stylesheet/i.test(tag)) return tag;
  const href = tag.match(/\bhref\s*=\s*(["'])(.*?)\1/i)?.[2];
  const file = href ? localPath(href, baseDir) : null;
  if (!file) return tag;
  counts.css++;
  const media = tag.match(/\bmedia\s*=\s*(["'])(.*?)\1/i)?.[2];
  return `<style${media ? ` media="${media}"` : ""}>\n${safeInline(inlineCssUrls(readFileSync(file, "utf8"), path.dirname(file)), "style")}\n</style>`;
});

// 2) <script src="local.js"></script> → <script> con su contenido (conserva type="module", etc.).
// Un script en línea ignora `defer`: los que lo tenían se mueven al final del <body>, en el mismo
// orden, para que sigan corriendo con la página ya cargada.
const deferred: string[] = [];
html = html.replace(/<script\b([^>]*)\bsrc\s*=\s*(["'])(.*?)\2([^>]*)>\s*<\/script>/gi, (match, before, _q, src, after) => {
  const file = localPath(src, baseDir);
  if (!file) return match;
  counts.js++;
  const rawAttrs = `${before}${after}`;
  const attrs = rawAttrs.replace(/\s+(?:defer|async)\b/gi, "").replace(/\s+/g, " ").trimEnd();
  const inline = `<script${attrs}>\n${safeInline(readFileSync(file, "utf8"), "script")}\n</script>`;
  if (/\bdefer\b/i.test(rawAttrs) && !/type\s*=\s*["']?module/i.test(rawAttrs)) {
    deferred.push(inline);
    return "";
  }
  return inline;
});
if (deferred.length) {
  html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${deferred.join("\n")}\n</body>`) : `${html}\n${deferred.join("\n")}`;
}

// 3) src/poster/href de imágenes en el HTML (img, source, video poster, link rel=icon…).
html = html.replace(/(\b(?:src|poster|href)\s*=\s*)(["'])(.*?)\2/gi, (match, attr, quote, ref) => {
  const data = imageDataUri(ref, baseDir);
  return data ? `${attr}${quote}${data}${quote}` : match;
});

// 4) srcset="a.png 1x, b.png 2x".
html = html.replace(/(\bsrcset\s*=\s*)(["'])(.*?)\2/gi, (match, attr, quote, value: string) => {
  const parts = value.split(",").map((part) => {
    const [ref, ...size] = part.trim().split(/\s+/);
    const data = ref ? imageDataUri(ref, baseDir) : null;
    return data ? [data, ...size].join(" ") : part.trim();
  });
  return `${attr}${quote}${parts.join(", ")}${quote}`;
});

// 5) url() en <style> y en style="..." del propio HTML.
html = html.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_m, open, css, close) => `${open}${inlineCssUrls(css, baseDir)}${close}`);
html = html.replace(/(\bstyle\s*=\s*)(["'])(.*?)\2/gi, (_m, attr, quote, css) => `${attr}${quote}${inlineCssUrls(css, baseDir)}${quote}`);

writeFileSync(output, html, "utf8");
const size = statSync(output).size;
console.log(`Listo: ${output}`);
console.log(`Incrustado: ${counts.imagenes} imagen(es), ${counts.css} CSS, ${counts.js} JS · ${(size / 1024).toFixed(0)} KB`);
if (missing.length) console.log(`No encontrado (revisar antes de subir): ${[...new Set(missing)].join(", ")}`);
if (size > MAX_BYTES) console.log("AVISO: pasa de 20 MB, la app no lo va a aceptar. Reducir las imágenes o dejar las grandes como link.");
// Lo que el script no puede incrustar (rutas armadas en JavaScript, fetch de .json, fuentes locales en
// @font-face con formato no imagen) se ve como "No encontrado" solo si aparece literal; revisar a mano.
