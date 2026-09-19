import assert from "node:assert/strict";
import { chooseTarget, pastedImageName, pickPastedImage, shouldHandlePaste } from "../src/lib/pasteImage";

// Chequeo puro (sin navegador) de la lógica de "pegar captura": qué archivo
// se toma, cómo se nombra, cuándo gana el pegado de texto y qué área de
// subida recibe la imagen.
assert.equal(pickPastedImage([{ type: "text/plain" }, { type: "image/png" }])?.type, "image/png");
assert.equal(pickPastedImage([{ type: "image/bmp" }, { type: "application/pdf" }]), undefined, "solo los tipos que acepta el servidor");
assert.equal(pickPastedImage([]), undefined);

const d = new Date(2026, 8, 19, 14, 5, 9);
assert.equal(pastedImageName("image/png", d), "captura-20260919-140509.png");
assert.equal(pastedImageName("image/jpeg", d), "captura-20260919-140509.jpg");

assert.equal(shouldHandlePaste(true, false, false), true, "captura con foco en la página");
assert.equal(shouldHandlePaste(true, true, false), true, "captura con foco en un campo de texto");
assert.equal(shouldHandlePaste(true, true, true), false, "imagen + texto en un campo: gana el texto");
assert.equal(shouldHandlePaste(true, false, true), true, "imagen + texto fuera de un campo: se toma la imagen");
assert.equal(shouldHandlePaste(false, false, false), false, "sin imagen no se hace nada");

assert.equal(chooseTarget([{ id: "a", hovered: false, area: 100 }]), "a", "una sola área: la usa aunque no haya mouse encima");
assert.equal(chooseTarget([{ id: "a", hovered: false, area: 100 }, { id: "b", hovered: false, area: 200 }]), undefined, "varias y ninguna con mouse: no adivina");
assert.equal(chooseTarget([{ id: "a", hovered: false, area: 100 }, { id: "b", hovered: true, area: 200 }]), "b", "gana la que tiene el mouse");
assert.equal(chooseTarget([{ id: "grande", hovered: true, area: 900 }, { id: "chica", hovered: true, area: 100 }]), "chica", "anidadas: la más chica");
assert.equal(chooseTarget([]), undefined);
assert.equal(chooseTarget([{ id: "a", hovered: false, area: 100 }], false), undefined, "el indicador no resalta la única área si no hay mouse/foco");
assert.equal(chooseTarget([{ id: "a", hovered: true, area: 100 }], false), "a", "el indicador sí resalta la que tiene mouse/foco");

console.log("verify-paste-image: OK");
