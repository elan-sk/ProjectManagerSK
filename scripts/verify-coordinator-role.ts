import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { deleteTestProject } from "./verifyCleanup";
import { canCreateProjects, canReassignPm, trustedActor, isPmAnywhere, isPmOrAdminAnywhere, isReviewerAnywhere } from "../src/lib/permissions";
import { clientFieldsFor, canCreateClients, clientPickerWhere, canUseClientAssistant } from "../src/lib/clients";
import { getToolsForUser } from "../src/lib/chontatecTools";
import { canUseProjectAssistant } from "../src/lib/projectAssistant";

async function main() {
  const stamp = Date.now();
  const mk = (name: string, role: "ADMIN" | "COORDINATOR" | "MEMBER") =>
    prisma.user.create({ data: { name: `__vc_${name}`, username: `__vc_${name}_${stamp}`, email: `__vc_${name}_${stamp}@prueba.local`, phone: `57301${String(stamp).slice(-7)}${name.length}`, passwordHash: "x", role } });
  const [admin, coord, otherCoord, member] = await Promise.all([mk("admin", "ADMIN"), mk("coord", "COORDINATOR"), mk("othercoord", "COORDINATOR"), mk("member", "MEMBER")]);
  const users: { id: string }[] = [admin, coord, otherCoord, member];
  const actor = (u: { id: string; role: string }) => trustedActor({ id: u.id, role: u.role });
  const project = await prisma.project.create({ data: { name: `__verify-coordinator-${stamp}__`, startDate: new Date("2026-11-06"), pmId: member.id, createdById: coord.id } });
  const clientNames = [`__vc_cliente_coord_${stamp}`, `__vc_cliente_member_${stamp}`];

  try {
    assert.equal(canCreateProjects(admin), true);
    assert.equal(canCreateProjects(coord), true);
    assert.equal(canCreateProjects(member), false, "RF-2: el Miembro no crea proyectos");
    assert.equal(await canUseProjectAssistant(member, null), false, "RF-3: el Miembro no entra al asistente de proyectos");
    assert.equal(await canUseProjectAssistant(coord, null), true);

    assert.equal(await canReassignPm(project.id, actor(admin)), true, "RF-5: admin cambia el PM");
    assert.equal(await canReassignPm(project.id, actor(coord)), true, "RF-5: el Coordinador creador cambia el PM");
    assert.equal(await canReassignPm(project.id, actor(otherCoord)), false, "RF-5: otro Coordinador no");
    assert.equal(await canReassignPm(project.id, actor(member)), false, "RF-5: el PM Miembro no");

    assert.equal(await canCreateClients(member), false, "RF-8");
    assert.equal(await canCreateClients(coord), true, "RF-7");
    await assert.rejects(clientFieldsFor({ clientName: clientNames[1] }, member.id), /Solo un administrador o un coordinador/, "RF-8: el Miembro no crea clientes");
    const created = await clientFieldsFor({ clientName: clientNames[0] }, coord.id);
    assert.ok(created.clientId, "RF-7: el Coordinador crea el cliente");
    const reused = await clientFieldsFor({ clientName: clientNames[0] }, member.id);
    assert.equal(reused.clientId, created.clientId, "RF-8: el Miembro puede usar un cliente existente");

    assert.deepEqual(clientPickerWhere(coord), {}, "RF-7: el Coordinador ve todos los nombres");
    assert.notDeepEqual(clientPickerWhere(member), {}, "el Miembro sigue limitado");

    // Regla única de PM (2026-11-11): quien creó el proyecto cuenta como PM aunque no figure en el campo PM.
    assert.equal(await isPmAnywhere(coord.id), true, "el Coordinador creador cuenta como PM");
    assert.equal(await isPmOrAdminAnywhere(actor(coord)), true, "crea categorías de etiqueta");
    assert.equal(await isReviewerAnywhere(actor(coord)), true, "gestiona plantillas de pruebas");
    assert.equal(await isPmAnywhere(otherCoord.id), false, "otro Coordinador sin proyectos no es PM");

    // Chat: el Coordinador sin proyectos igual tiene las herramientas para crear proyectos y clientes.
    const coordTools = (await getToolsForUser(otherCoord.id)).map((t) => t.name);
    assert.ok(coordTools.includes("create_project") && coordTools.includes("save_client"), "el Coordinador crea proyectos y clientes desde el chat");
    const memberUser = await mk("plainmember", "MEMBER");
    users.push(memberUser);
    assert.equal((await getToolsForUser(memberUser.id)).some((t) => t.name === "create_project"), false, "un Miembro sin proyectos no");

    // Asistente de clientes: nuevo = admin o coordinador; completar uno existente = solo admin.
    assert.equal(await canUseClientAssistant(otherCoord, null), true, "el Coordinador registra clientes nuevos");
    assert.equal(await canUseClientAssistant(otherCoord, created.clientId!), false, "el Coordinador no completa fichas existentes");
    assert.equal(await canUseClientAssistant(admin, created.clientId!), true);
    assert.equal(await canUseClientAssistant(member, null), false, "el Miembro no usa el asistente de clientes");

    const pmMembers = await prisma.user.count({ where: { role: "MEMBER", deletedAt: null, pmOfProjects: { some: {} }, id: { notIn: users.map((u) => u.id) } } });
    assert.equal(pmMembers, 0, "RF-10: ningún Miembro existente quedó como PM sin pasar a Coordinador");

    console.log("verify:coordinator-role OK");
  } finally {
    await prisma.client.deleteMany({ where: { name: { in: clientNames } } });
    await deleteTestProject(project.id);
    await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
