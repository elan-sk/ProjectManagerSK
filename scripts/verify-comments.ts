import assert from "node:assert/strict";
import { COMMENT_EDIT_WINDOW_MS, commentEditError, commentPreview, imageMarker, splitCommentBody } from "../src/lib/commentBody";

// Chequeo puro de los comentarios: marcas de imagen y ventana de 5 minutos
// para editar/eliminar (la misma función que valida el servidor).
const url = "/uploads/abc-123.png";
assert.equal(imageMarker(url), "[[img:/uploads/abc-123.png]]");

const body = `Mira esto ${imageMarker(url)}\ny esto otro ${imageMarker("/uploads/x.jpg")} fin`;
const parts = splitCommentBody(body);
assert.deepEqual(parts.map((p) => p.type), ["text", "image", "text", "image", "text"]);
assert.equal((parts[1] as { url: string }).url, url);
assert.deepEqual(splitCommentBody("solo texto"), [{ type: "text", text: "solo texto" }]);
assert.deepEqual(splitCommentBody(imageMarker(url)), [{ type: "image", url }], "solo una imagen");

// Solo rutas de /uploads con nombre simple: nada de URLs externas ni rutas raras.
for (const bad of ["[[img:https://evil.com/x.png]]", "[[img:/uploads/../secreto.png]]", "[[img:/otra/ruta.png]]", "[[img:/uploads/a/b.png]]"]) {
  assert.deepEqual(splitCommentBody(bad), [{ type: "text", text: bad }], `no se reconoce: ${bad}`);
}

assert.equal(commentPreview(`hola ${imageMarker(url)}   chau`), "hola [imagen] chau");
assert.equal(commentPreview("a\n\nb"), "a b");

// Ventana de edición
const t0 = 1_000_000;
assert.equal(commentEditError("u1", "u1", t0, t0), null, "recién publicado");
assert.equal(commentEditError("u1", "u1", t0, t0 + COMMENT_EDIT_WINDOW_MS), null, "justo a los 5 minutos todavía se puede");
assert.match(commentEditError("u1", "u1", t0, t0 + COMMENT_EDIT_WINDOW_MS + 1) ?? "", /5 minutos/, "un instante después ya no");
assert.match(commentEditError("u1", "u2", t0, t0) ?? "", /Solo quien escribió/, "otra persona nunca");
assert.match(commentEditError("u1", "u2", t0, t0 + COMMENT_EDIT_WINDOW_MS + 1) ?? "", /Solo quien escribió/, "otra persona: gana el motivo de autoría");
assert.equal(commentEditError("u1", "u1", new Date(t0), t0 + 1000), null, "acepta Date");

console.log("verify-comments: OK");
