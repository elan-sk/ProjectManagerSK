// Chequeo de la spec 004 (subproyectos): reglas de dos niveles, permisos del PM padre/hijo,
// filtro «Proyecto» y agrupado de listas. Uso: npm run verify:subprojects
import assert from "node:assert/strict";
import { canSeeProject, isProjectPm } from "../src/lib/permissions";
import { expandProjectFilter, groupRows, parentLinkError, projectFilterOptions, subprojectsNote, worstVariance } from "../src/lib/subprojects";
import { groupPmSummaries, type PmProjectSummary } from "../src/lib/agendaSummary";

const live = true;
// RF-1 / RF-2: dos niveles.
assert.equal(parentLinkError({ id: "a", parentId: null, childrenCount: 0 }, { id: "p", parentId: null, live }), null);
assert.match(parentLinkError({ id: "p", parentId: null, childrenCount: 0 }, { id: "p", parentId: null, live })!, /sí mismo/);
assert.match(parentLinkError({ id: "a", parentId: null, childrenCount: 0 }, { id: "h", parentId: "p", live })!, /no puede tener subproyectos/);
assert.match(parentLinkError({ id: "p2", parentId: null, childrenCount: 2 }, { id: "p", parentId: null, live })!, /ya tiene subproyectos/);
assert.match(parentLinkError({ id: "a", parentId: "otro", childrenCount: 0 }, { id: "p", parentId: null, live })!, /ya es subproyecto/);
assert.match(parentLinkError({ id: "a", parentId: null, childrenCount: 0 }, { id: "p", parentId: null, live: false })!, /no está activo/);

// RF-5 / RF-6: el PM del padre administra al hijo; el PM del hijo no al padre ni a hermanos.
const child = { pmId: "pmHijo", parent: { pmId: "pmPadre" } };
const parent = { pmId: "pmPadre", parent: null };
const sibling = { pmId: "otroPm", parent: { pmId: "pmPadre" } };
assert.ok(isProjectPm(child, "pmPadre"));
assert.ok(isProjectPm(child, "pmHijo"));
assert.ok(!isProjectPm(parent, "pmHijo"));
assert.ok(!isProjectPm(sibling, "pmHijo"));

// RF-8: hijo oculto → solo admin PM del hijo o del padre.
const hiddenChild = { hidden: true, ...child };
assert.ok(canSeeProject(hiddenChild, { id: "pmPadre", role: "ADMIN" }));
assert.ok(canSeeProject(hiddenChild, { id: "pmHijo", role: "ADMIN" }));
assert.ok(!canSeeProject(hiddenChild, { id: "pmPadre", role: "MEMBER" }));
assert.ok(!canSeeProject(hiddenChild, { id: "otroAdmin", role: "ADMIN" }));

// RF-18 / RF-27: elegir padre incluye hijos; elegir hijo solo ese.
const nodes = [
  { id: "p", parentId: null, name: "Ecosistema" },
  { id: "h1", parentId: "p", name: "App" },
  { id: "h2", parentId: "p", name: "Web" },
  { id: "x", parentId: null, name: "Aparte" },
];
assert.deepEqual([...expandProjectFilter("p", nodes)!].sort(), ["h1", "h2", "p"]);
assert.deepEqual([...expandProjectFilter("h1", nodes)!], ["h1"]);
assert.equal(expandProjectFilter(undefined, nodes), null);
assert.deepEqual(projectFilterOptions(nodes).map((o) => o.label), ["Aparte", "Ecosistema", "Ecosistema › App", "Ecosistema › Web"]);
// Hijo sin su padre en la lista: sale suelto con el nombre del padre.
assert.deepEqual(projectFilterOptions([{ id: "h1", parentId: "p", name: "App", parentName: "Ecosistema" }]).map((o) => o.label), ["Ecosistema › App"]);

// RF-24 / RF-25: el hijo sale dentro del padre si el padre está; si no, suelto.
const g = groupRows(nodes);
assert.deepEqual(g.visible.map((r) => r.id), ["p", "x"]);
assert.deepEqual(g.childrenOf.get("p")!.map((r) => r.id), ["h1", "h2"]);
assert.deepEqual(groupRows([nodes[1]]).visible.map((r) => r.id), ["h1"]);

// RF-23: peor retraso del grupo.
assert.equal(worstVariance([3, -2, null]), -2);
assert.equal(worstVariance([null]), null);

// RF-23 / RF-24: la fila del principal suma su grupo; el subproyecto no sale aparte.
const row = (id: string, parentId: string | null, total: number, completed: number, overdue: number, variance: number | null): PmProjectSummary => ({
  id, name: id, iconUrl: null, parentId, parent: parentId ? { name: parentId, iconUrl: null } : null, pm: { name: "PM", avatarUrl: null },
  total, completed, blockedCount: 0, health: "ok", lateStartCount: 0, overdueCount: overdue, warningCount: 0, startingSoonCount: 0, scheduleVarianceDays: variance,
});
const pm = groupPmSummaries([row("p", null, 4, 2, 0, 3), row("h1", "p", 6, 1, 2, -4), row("suelto", "otro", 2, 2, 0, null)]);
assert.deepEqual(pm.map((r) => r.id), ["p", "suelto"]);
assert.equal(pm[0].total, 10);
assert.equal(pm[0].completed, 3);
assert.equal(pm[0].overdueCount, 2);
assert.equal(pm[0].scheduleVarianceDays, -4);
assert.deepEqual(pm[0].subprojects!.map((s) => s.id), ["h1"]);
assert.equal(pm[1].parent?.name, "otro");

// RF-28: aviso de cascada.
assert.equal(subprojectsNote(0, "archivará"), "");
assert.equal(subprojectsNote(1, "archivará"), " También se archivará su subproyecto.");
assert.equal(subprojectsNote(3, "archivará"), " También se archivarán sus 3 subproyectos.");

console.log("verify-subprojects: OK");
