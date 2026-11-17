import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { findMissingReferences } from "../src/lib/botReferenceCheck";
import { ALL_TOOLS, WRITE_TOOL_NAMES } from "../src/lib/chontatecTools";

// Un plan del bot que nombra algo inexistente se frena antes de «Confirmar», con opciones válidas.
async function main() {
  const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN", active: true }, select: { id: true } });
  const task = await prisma.task.findFirstOrThrow({ select: { id: true, projectId: true } });
  const person = await prisma.user.findFirstOrThrow({ where: { active: true, deletedAt: null }, select: { id: true, name: true } });

  // 1. El caso del 2026-11-17: 37 cambios de fecha bien + 1 responsable inexistente.
  const plan = [
    ...Array.from({ length: 37 }, (_, i) => ({ id: `d${i}`, name: "update_task_schedule", input: { taskId: task.id, plannedStart: "2026-11-18" } })),
    { id: "r1", name: "reassign_task", input: { taskId: task.id, addUserId: "cmfantasma000" } },
  ];
  const problems = await findMissingReferences(plan, admin.id);
  assert.deepEqual([...problems.keys()], ["r1"], "solo se marca la acción con la persona inexistente");
  assert.match(problems.get("r1")!, /No existe la persona/);
  assert.match(problems.get("r1")!, new RegExp(person.id), "ofrece personas reales como alternativa");

  // 2. Plan correcto: no se frena.
  assert.equal((await findMissingReferences([{ id: "ok", name: "reassign_task", input: { taskId: task.id, addUserId: person.id } }], admin.id)).size, 0);

  // 3. Vacío = «quitar» (cliente, proyecto principal): no es una referencia.
  assert.equal((await findMissingReferences([{ id: "e", name: "update_project", input: { projectId: task.projectId, clientId: "", parentId: "" } }], admin.id)).size, 0);

  // 4. Toda herramienta de escritura: cada campo con id inexistente se detecta (o queda listado como no revisado).
  const unchecked: string[] = [];
  for (const tool of ALL_TOOLS.filter((t) => WRITE_TOOL_NAMES.has(t.name))) {
    const props = (tool.input_schema as { properties?: Record<string, { type?: string }> }).properties ?? {};
    for (const [key, schema] of Object.entries(props)) {
      if (!/Ids?$/.test(key)) continue;
      const fake = schema.type === "array" ? ["zz-no-existe"] : "zz-no-existe";
      const found = await findMissingReferences([{ id: "x", name: tool.name, input: { [key]: fake, scope: "qa_check" } }], admin.id);
      if (!found.size) unchecked.push(`${tool.name}.${key}`);
    }
  }
  console.log("Campos sin revisar (comentario respondido: puede ser de varios hilos):", unchecked.join(", ") || "ninguno");
  assert.deepEqual(unchecked.sort(), ["post_thread_comment.parentId"]);

  console.log("OK: el plan se frena solo por lo inexistente y ofrece alternativas.");
  console.log("\nEjemplo de lo que recibe el bot:\n", problems.get("r1")!.slice(0, 300), "…");
}

main().finally(() => prisma.$disconnect());
