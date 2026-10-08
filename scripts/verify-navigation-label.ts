import assert from "node:assert/strict";
import { navigationLabel as L } from "../src/lib/activityStatus";

// Textos de la barra de estado inferior según a dónde se navega. Uso: npx tsx scripts/verify-navigation-label.ts
const B = "http://localhost:3000";
const P = `${B}/projects/p1`;

assert.equal(L("/agenda", `${B}/projects`), "Entrando a la Agenda");
assert.equal(L("/projects", `${B}/agenda`), "Entrando a Proyectos");
assert.equal(L("/settings", `${B}/agenda`), "Entrando a Configuración");
assert.equal(L("/performance/u1", `${B}/agenda`), "Entrando a Rendimiento");
assert.equal(L("/projects/p1/tasks/t1", P, "Diseño UX"), 'Abriendo la tarea "Diseño UX"');
assert.equal(L("/projects/p1/tasks/t1", P, "x".repeat(80)), "Abriendo la tarea", "un texto de tarjeta entera no sirve de nombre");
assert.equal(L("/projects/p2", `${B}/projects`, "  Editec \n"), 'Abriendo el proyecto "Editec"');
assert.equal(L("/projects/p2", `${B}/projects`, "← Todos los proyectos"), "Abriendo el proyecto");
assert.equal(L("/credentials/c1", `${B}/agenda`), "Abriendo la contraseña");
assert.equal(L("/projects/p1?view=gantt", P), "Mostrando el Gantt");
assert.equal(L("/projects/p1?view=files&fileQ=factura", `${P}?view=files`), 'Buscando "factura"');
assert.equal(L("/projects/p1?view=files", `${P}?view=files&fileQ=factura`), "Limpiando la búsqueda");
assert.equal(L("/agenda?from=2026-10-01&to=2026-10-31", `${B}/agenda`), "Cambiando las fechas");
assert.equal(L("/agenda?status=BLOCKED", `${B}/agenda`), "Aplicando filtros");
assert.equal(L("/algo-nuevo", `${B}/agenda`), "Cargando…");

console.log("verify-navigation-label: OK (secciones, tarea, proyecto, contraseña, vistas, búsqueda, fechas, filtros)");
