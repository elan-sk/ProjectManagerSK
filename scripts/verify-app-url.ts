// La app publicada (NEXTAUTH_URL) es la fuente de todo link absoluto que sale de la app:
// el chat que arma un link para WhatsApp, los avisos, el correo de recuperación.
import assert from "node:assert/strict";
import { absoluteUrl, appUrl } from "../src/lib/appUrl";

process.env.NEXTAUTH_URL = "https://pmsk.ejemplo.com/";
assert.equal(appUrl(), "https://pmsk.ejemplo.com");
assert.equal(
  absoluteUrl("/projects/p1/tasks/t1"),
  "https://pmsk.ejemplo.com/projects/p1/tasks/t1",
);
assert.equal(
  absoluteUrl("projects/p1"),
  "https://pmsk.ejemplo.com/projects/p1",
);
// Sin NEXTAUTH_URL no se inventa un dominio (antes se caía a localhost, que no le sirve a nadie).
delete process.env.NEXTAUTH_URL;
assert.equal(appUrl(), null);
assert.equal(absoluteUrl("/projects/p1"), null);
console.log(
  "OK — los links absolutos salen de NEXTAUTH_URL, nunca de un dominio inventado",
);
