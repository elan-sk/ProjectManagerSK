import assert from "node:assert/strict";
import { fuzzyScore, weightedScore } from "../src/lib/fuzzy";
import { matchesDateRange, parseDayKey } from "../src/lib/dateRange";
import { progressBar } from "../src/lib/progressBar";
import { HEADER_SEARCH_OPTIONS, combinedGroupKind, isCompactSearch, parseCombinedSearch, parseHeaderSearch, parseTagSegment, splitActiveSegment, splitFilterValue } from "../src/lib/search";

// Nombre del proyecto de la tarea: la encuentra, pero pesa menos que el título y que la descripción.
{
  const byProject = weightedScore("cafexport", "Ajustes de logos", "Ajustes de logos cambiar imágenes", "Cafexport");
  const byBody = weightedScore("cafexport", "Ajustes de logos", "Ajustes de logos para cafexport", "Otro");
  const byTitle = weightedScore("cafexport", "Cafexport logos", "Cafexport logos", "Otro");
  assert.ok(byProject > 0 && byProject < byBody && byBody < byTitle);
  assert.equal(weightedScore("cafexport", "Ajustes de logos", "Ajustes de logos"), 0);
  // Palabras repartidas entre la tarea y su proyecto también la encuentran.
  assert.ok(weightedScore("cafexport logos", "Ajustes de logos", "Ajustes de logos", "Cafexport") > weightedScore("cafexport logos", "Ajustes de textos", "Ajustes de textos", "Otro"));
}

for (const { prefix, kind } of HEADER_SEARCH_OPTIONS) {
  assert.deepEqual(parseHeaderSearch(`${prefix}:`), { filter: kind, text: "" });
  assert.deepEqual(parseHeaderSearch(`${prefix}: entrega`), { filter: kind, text: "entrega" });
}

for (const prefix of ["clave:", "claves:", "contraseñas:", "contraseña:", "CONTRASEÑA:", "contrasena:", " Clave : "]) {
  assert.deepEqual(parseHeaderSearch(prefix), { filter: "credential", text: "" });
  assert.deepEqual(parseHeaderSearch(`${prefix} correo `), { filter: "credential", text: "correo" });
}
assert.deepEqual(parseHeaderSearch("clave:https://ejemplo.com:8080"), {
  filter: "credential", text: "https://ejemplo.com:8080",
}, "conserva los dos puntos del texto buscado");
for (const text of ["clave", "contraseña", "https://ejemplo.com", "mi clave: correo"]) {
  assert.deepEqual(parseHeaderSearch(text), { filter: null, text }, "conserva la búsqueda general");
}
for (const [prefix, filter] of [["proyecto", "project"], ["tarea", "task"], ["comentario", "comment"], ["archivo", "file"]]) {
  assert.deepEqual(parseHeaderSearch(`${prefix}:`), { filter, text: "" });
  assert.deepEqual(parseHeaderSearch(` ${prefix.toUpperCase()} : entrega `), { filter, text: "entrega" });
  assert.deepEqual(parseHeaderSearch(`${prefix}s: entrega`), { filter, text: "entrega" }, "el plural vale igual");
  assert.deepEqual(parseHeaderSearch(prefix), { filter: null, text: prefix });
}
assert.deepEqual(parseHeaderSearch("constructor: prueba"), { filter: null, text: "constructor: prueba" });
assert.ok(fuzzyScore(parseHeaderSearch("contraseña: gestion").text, "Gestión correo") > 0);
assert.equal(fuzzyScore(parseHeaderSearch("clave: correo").text, "Servidor respaldo"), 0);

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

// Barra de 5 bloques (20 % cada uno), redondeada; llena solo al 100 %.
assert.equal(progressBar(0), "░".repeat(10));
assert.equal(progressBar(4), "░".repeat(10), "menos de 5 % no llena ningún bloque");
assert.equal(progressBar(60), "██████░░░░");
assert.equal(progressBar(96), "█████████░", "96 % no se ve como completo");
assert.equal(progressBar(100), "█".repeat(10));
assert.equal([...progressBar(57)].length, 10, "siempre 10 bloques");

assert.equal(isCompactSearch(384, 1280), false);
assert.equal(isCompactSearch(224, 1024), false);
assert.equal(isCompactSearch(223, 1280), true);
assert.equal(isCompactSearch(110, 1280), true);
assert.equal(isCompactSearch(384, 1023), true);
// Filtros combinados: «&» (y) pesa más que «|» (o); el orden de los filtros no cambia el grupo.
{
  const tag = { filter: "tag", text: "sprint:" } as const;
  const project = { filter: "project", text: "racafe:" } as const;
  assert.deepEqual(parseCombinedSearch("etiquetas:sprint:&proyecto:racafe:"), [[tag, project]]);
  assert.deepEqual(parseCombinedSearch("proyecto:racafe:&etiquetas:sprint:"), [[project, tag]]);
  assert.deepEqual(parseCombinedSearch("etiquetas:sprint:&proyecto:racafe:|estados:hecho:"), [[tag, project], [{ filter: "taskStatus", text: "hecho:" }]]);
  assert.deepEqual(parseCombinedSearch("etiquetas:sprint:&"), [[tag]], "tramo vacío recién escrito: no filtra");
  assert.deepEqual(parseCombinedSearch("etiquetas:sprint:&pro"), [[tag]], "filtro a medio escribir: no filtra");
  assert.equal(parseCombinedSearch("etiquetas:sprint:"), null, "sin «&»/«|» es simple");
  assert.equal(parseCombinedSearch("R&D informe"), null, "texto común con «&»");
  assert.equal(parseCombinedSearch("clave:https://x.com?a=1&b=2"), null, "«&» dentro de lo buscado");
  assert.deepEqual(splitActiveSegment("etiquetas:sprint:&pro"), { head: "etiquetas:sprint:&", piece: "pro" });
  assert.deepEqual(splitActiveSegment("etiquetas:sprint:|"), { head: "etiquetas:sprint:|", piece: "" });
  assert.deepEqual(splitActiveSegment("clave:a&b=2"), { head: "", piece: "clave:a&b=2" });
  assert.equal(combinedGroupKind([tag, project]), "task");
  assert.equal(combinedGroupKind([project]), "project", "solo proyecto: esos proyectos");
  assert.equal(combinedGroupKind([project, { filter: "project", text: "paguer:" }]), "project");
  assert.deepEqual(parseCombinedSearch("proyectos:paguer:|proyectos:racafe"), [[{ filter: "project", text: "paguer:" }], [{ filter: "project", text: "racafe" }]]);
  assert.equal(combinedGroupKind([{ filter: "file", text: "" }, project]), "file");
  assert.equal(combinedGroupKind([{ filter: "file", text: "" }, { filter: "comment", text: "" }]), null, "dos tipos distintos no dan nada");
  assert.deepEqual(splitFilterValue("racafe:login"), { value: "racafe", content: "login" });
  assert.deepEqual(splitFilterValue("racafe"), { value: "racafe", content: "" });
  assert.deepEqual(parseTagSegment("sprint"), { text: "sprint", category: null, name: null, content: "" });
  assert.deepEqual(parseTagSegment("sprint:"), { text: "sprint:", category: "sprint", name: "", content: "" });
  assert.deepEqual(parseTagSegment("sprint:2:login"), { text: "sprint:2:login", category: "sprint", name: "2", content: "login" });
  assert.deepEqual(parseTagSegment("sprint: login"), { text: "sprint: login", category: "sprint", name: "", content: "login" });
}
console.log("verify-search-filters: OK");
