import assert from "node:assert/strict";
import { fuzzyScore } from "../src/lib/fuzzy";
import { matchesDateRange, parseDayKey } from "../src/lib/dateRange";
import { progressBar } from "../src/lib/progressBar";

// Chequeo puro (sin DB) del buscador difuso del header y del filtro de rango
// de fechas: tildes/mayúsculas, errores de tipeo, orden de palabras y cruce
// de plazos con el rango.
const hit = (q: string, text: string) => fuzzyScore(q, text) > 0;

assert.ok(hit("gestion", "Gestión de proyectos"), "ignora tildes");
assert.ok(hit("GESTIÓN", "gestion de proyectos"), "ignora mayúsculas");
assert.ok(hit("proyeto", "Reunión de proyecto"), "tolera una letra faltante");
assert.ok(hit("tarae", "Crear tarea"), "tolera transposición");
assert.ok(hit("reunion cliente", "Cliente: reunión semanal"), "no exige orden");
assert.ok(hit("informe final entrga", "Entrega del informe final"), "frase con una palabra mal escrita");
assert.ok(!hit("zzzz", "Reunión de proyecto"), "no coincide con algo sin relación");
assert.ok(!hit("ab", "xyz"), "palabras cortas no toleran errores");
assert.ok(fuzzyScore("tarea", "tarea") > fuzzyScore("tarea", "tareas"), "exacta puntúa más que prefijo");

assert.equal(parseDayKey("2026-09-18"), "2026-09-18");
assert.equal(parseDayKey("18/09/2026"), undefined);
const task = { plannedStart: new Date("2026-09-10T00:00:00Z"), plannedEnd: new Date("2026-09-15T00:00:00Z") };
assert.ok(matchesDateRange(task, "2026-09-12", "2026-09-20"), "se cruza por el final");
assert.ok(matchesDateRange(task, "2026-09-01", "2026-09-10"), "se cruza por el inicio");
assert.ok(matchesDateRange(task, "2026-09-01", "2026-09-30"), "el rango la contiene");
assert.ok(!matchesDateRange(task, "2026-09-16", "2026-09-30"), "termina antes del rango");
assert.ok(!matchesDateRange(task, "2026-08-01", "2026-09-09"), "empieza después del rango");
assert.ok(matchesDateRange(task, undefined, undefined), "sin rango pasa todo");

assert.equal(progressBar(0), "⬜".repeat(10));
assert.equal(progressBar(35), "🟥".repeat(3) + "⬜".repeat(7));
assert.equal(progressBar(50), "🟨".repeat(5) + "⬜".repeat(5));
assert.equal(progressBar(100), "🟩".repeat(10));

console.log("verify-search-filters: OK");
