import assert from "node:assert/strict";
import { appendDictation } from "../src/lib/dictation";

assert.equal(appendDictation("", "hola"), "hola");
assert.equal(appendDictation("hola", "cómo va el proyecto"), "hola cómo va el proyecto");
assert.equal(appendDictation("hola ", "equipo"), "hola equipo");
assert.equal(appendDictation("hola", " coma "), "hola,");
assert.equal(appendDictation("hola ", "Punto."), "hola.");
assert.equal(appendDictation("va atrasado", "interrogación"), "va atrasado?");
assert.equal(appendDictation("listo", "Signo de exclamación"), "listo!");
assert.equal(appendDictation("dos opciones", "dos puntos"), "dos opciones:");
assert.equal(appendDictation("el punto de la reunión", "es mañana"), "el punto de la reunión es mañana");
assert.equal(appendDictation("hola", "   "), "hola");

console.log("verify-dictation: OK");
