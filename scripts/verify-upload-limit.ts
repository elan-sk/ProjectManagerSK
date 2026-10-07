import assert from "node:assert/strict";
import { MAX_UPLOAD_BYTES, TOO_LARGE_MESSAGE, isTooLarge } from "../src/lib/uploadLimits";
import { uploadWithProgress } from "../src/lib/uploadWithProgress";

// Tope de subida (MAX_UPLOAD_MB): un archivo más grande no se envía y vuelve la sugerencia
// de dejar un enlace (Drive u otro servicio). Correr: npx tsx scripts/verify-upload-limit.ts
assert.equal(isTooLarge({ size: MAX_UPLOAD_BYTES }), false);
assert.equal(isTooLarge({ size: MAX_UPLOAD_BYTES + 1 }), true);
assert.match(TOO_LARGE_MESSAGE, /Google Drive/);

const form = new FormData();
form.append("file", new Blob([new Uint8Array(MAX_UPLOAD_BYTES + 1)]), "grande.pdf");
// En Node no hay XMLHttpRequest: si intentara enviar, fallaría en vez de devolver el aviso.
uploadWithProgress("/api/upload", form).then(({ ok, body }) => {
  assert.equal(ok, false);
  assert.equal(body.error, TOO_LARGE_MESSAGE);
  console.log(`OK: el archivo de más de ${MAX_UPLOAD_BYTES / 1024 / 1024} MB no se envía y devuelve la sugerencia del enlace.`);
});
