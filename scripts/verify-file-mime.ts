// El tipo de archivo sale del nombre o, si el nombre no tiene extensión, de la ruta: un nombre como
// «Antes 01 - Encabezado» dejaba la imagen como archivo genérico (ícono roto, sin miniatura).
import assert from "node:assert/strict";
import { mimeFromFileName, resolveMime } from "../src/lib/uploadLimits";

assert.equal(mimeFromFileName("Antes 01 - Encabezado", "/uploads/abc123.png"), "image/png");
assert.equal(mimeFromFileName("foto.jpg", "/uploads/abc.png"), "image/jpeg");
assert.equal(mimeFromFileName("sin extension"), "application/octet-stream");
assert.equal(resolveMime("application/octet-stream", "Antes 02", "/uploads/x.webp"), "image/webp");
assert.equal(resolveMime("image/png", "x", "/uploads/x.jpg"), "image/png");
console.log("verify-file-mime: ok");
