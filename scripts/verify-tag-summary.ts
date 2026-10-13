import assert from "node:assert/strict";
import { tagNameSchema } from "../src/lib/tagNameInput";
import { summarizeTagCategories } from "../src/lib/tagSummary";

const base = { id: "category", name: "Componente", colorHex: "#000000", emoji: null };
const tag = (id: string, name: string, project: string, count: number) => ({ id, name, project: { name: project }, _count: { taskTags: count } });
const input = [{ ...base, tags: [tag("a", "Inicio", "Proyecto A", 3), tag("b", "Inicio", "Proyecto B", 2), tag("c", "", "Proyecto A", 1), tag("d", "Sin uso", "Proyecto A", 0)] }, { ...base, id: "empty", tags: [] }];
const snapshot = structuredClone(input);
const result = summarizeTagCategories(input);
assert.equal(result[0].taskCount, 6);
assert.deepEqual(result[0].tags.map(t => [t.id, t.projectName, t.taskCount]), [["a", "Proyecto A", 3], ["b", "Proyecto B", 2], ["c", "Proyecto A", 1], ["d", "Proyecto A", 0]]);
assert.equal(result[0].tags[2].name, "");
assert.equal(result[1].taskCount, 0);
assert.deepEqual(result[1].tags, []);
assert.deepEqual(summarizeTagCategories([]), []);
assert.deepEqual(input, snapshot);
assert.equal(summarizeTagCategories([{ ...base, tags: input[0].tags.filter(t => t.id !== "a") }])[0].taskCount, 3);
console.log("Conteos de etiquetas: OK (categorías vacías, etiquetas sin uso/nombre, proyectos distintos y eliminación).");


assert.equal(tagNameSchema.parse("  Cabecera  "), "Cabecera");
assert.ok(!tagNameSchema.safeParse("   ").success);
assert.ok(!tagNameSchema.safeParse("a".repeat(81)).success);
assert.ok(tagNameSchema.safeParse("a".repeat(80)).success);
assert.ok(!tagNameSchema.safeParse(null).success);
const editable = summarizeTagCategories([{ ...base, tags: [{ ...tag("editable", "Nombre", "Proyecto A", 2), canEdit: true }] }]);
assert.equal(editable[0].tags[0].canEdit, true);
assert.equal(editable[0].tags[0].taskCount, 2);
console.log("Edición de etiquetas: validación de nombre y permisos de presentación OK.");
