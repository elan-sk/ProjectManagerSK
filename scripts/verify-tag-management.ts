import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { deleteTestProject } from "./verifyCleanup";
import { trustedActor } from "../src/lib/permissions";
import { createTag, updateTag, deleteTag } from "../src/app/(app)/settings/tags/tagActions";

// Etiquetas sueltas (Configuración, API y bot usan las mismas acciones): crear y renombrar = PM del
// proyecto (también quien lo creó) o admin; eliminar = solo admin. Fuera de Next, el refresco de
// pantallas (revalidatePath) lanza después de guardar: por eso el éxito se comprueba en la base.
async function main() {
  const stamp = Date.now();
  const mk = (name: string, role: "ADMIN" | "COORDINATOR" | "MEMBER") =>
    prisma.user.create({ data: { name: `__vt_${name}`, username: `__vt_${name}_${stamp}`, email: `__vt_${name}_${stamp}@prueba.local`, phone: `57302${String(stamp).slice(-7)}${name.length}`, passwordHash: "x", role } });
  const [admin, creator, pm, outsider] = await Promise.all([mk("admin", "ADMIN"), mk("creator", "COORDINATOR"), mk("pm", "MEMBER"), mk("outsider", "MEMBER")]);
  const users = [admin, creator, pm, outsider];
  const actor = (u: { id: string; role: string }) => trustedActor({ id: u.id, role: u.role });
  const project = await prisma.project.create({ data: { name: `__verify-tags-${stamp}__`, startDate: new Date("2026-11-11"), pmId: pm.id, createdById: creator.id } });
  const category = await prisma.tagCategory.create({ data: { name: `__vt_cat_${stamp}`, colorHex: "#0a6b78" } });
  const find = (name: string) => prisma.tag.findFirst({ where: { projectId: project.id, categoryId: category.id, name } });

  try {
    const denied = await createTag(category.id, project.id, "Ajena", actor(outsider));
    assert.equal(denied.ok, false, "quien no es PM del proyecto no crea etiquetas");

    await createTag(category.id, project.id, "S1. Home", actor(pm)).catch(() => null);
    assert.ok(await find("S1. Home"), "el PM crea la etiqueta");
    await createTag(category.id, project.id, "S2. Perfil", actor(creator)).catch(() => null);
    assert.ok(await find("S2. Perfil"), "quien creó el proyecto también");

    const dup = await createTag(category.id, project.id, "S1. Home", actor(pm));
    assert.equal(dup.ok, false, "no se duplica en la misma categoría y proyecto");

    const tag = (await find("S1. Home"))!;
    const renameDenied = await updateTag(tag.id, "Otra", actor(outsider));
    assert.equal(renameDenied.ok, false, "quien no es PM no la renombra");
    await updateTag(tag.id, "S1. Inicio", actor(pm)).catch(() => null);
    assert.ok(await find("S1. Inicio"), "el PM la renombra");

    const deleteDenied = await deleteTag(tag.id, actor(pm));
    assert.equal(deleteDenied.ok, false, "solo un administrador elimina");
    await deleteTag(tag.id, actor(admin)).catch(() => null);
    assert.equal(await find("S1. Inicio"), null, "el administrador la elimina");

    console.log("verify:tag-management OK");
  } finally {
    await prisma.tag.deleteMany({ where: { categoryId: category.id } });
    await prisma.tagCategory.delete({ where: { id: category.id } });
    await deleteTestProject(project.id);
    await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
