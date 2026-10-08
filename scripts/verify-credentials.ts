import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { deleteTestProject } from "./verifyCleanup";
import { encryptPassword, decryptPassword } from "../src/lib/credentialCrypto";
import { credentialAudienceIds, credentialVisibleWhere } from "../src/lib/credentials";
import { trustedActor } from "../src/lib/permissions";

// Contraseñas (credenciales): cifrado y reglas de quién las ve. Corre contra la DB local (crea y
// borra sus propios datos) porque la regla vive en un filtro de Prisma.
// Uso: npx tsx scripts/verify-credentials.ts
async function main() {
  // 1) Cifrado: ida y vuelta, IV distinto cada vez, y un dato alterado no se puede leer.
  const a = encryptPassword("Clave$egura 123 ñ");
  const b = encryptPassword("Clave$egura 123 ñ");
  assert.notEqual(a, b, "cada cifrado usa un IV nuevo");
  assert.ok(!a.includes("Clave"), "la contraseña no queda en texto plano");
  assert.equal(decryptPassword(a), "Clave$egura 123 ñ");
  const [v, iv, tag] = a.split(":");
  assert.equal(decryptPassword([v, iv, tag, Buffer.from("otro dato").toString("base64")].join(":")), null, "dato alterado → null");
  assert.equal(decryptPassword("basura"), null);

  // 2) Visibilidad.
  const stamp = Date.now();
  const mk = (name: string, role: "ADMIN" | "MEMBER" = "MEMBER") =>
    prisma.user.create({ data: { name: `__vc_${name}`, username: `__vc_${name}_${stamp}`, passwordHash: "x", role } });
  const [pm, assignee, reviewer, outsider, picked, admin, creator] = await Promise.all([
    mk("pm"),
    mk("assignee"),
    mk("reviewer"),
    mk("outsider"),
    mk("picked"),
    mk("admin", "ADMIN"),
    mk("creator"),
  ]);
  const users = [pm, assignee, reviewer, outsider, picked, admin, creator];
  const project = await prisma.project.create({
    data: { name: `__verify-credentials-${stamp}__`, startDate: new Date("2026-10-07"), pmId: pm.id, phases: { create: [{ name: "F1", order: 0 }] } },
    include: { phases: true },
  });
  try {
    const task = await prisma.task.create({
      data: {
        projectId: project.id,
        phaseId: project.phases[0].id,
        title: "T",
        plannedStart: new Date("2026-10-07"),
        plannedEnd: new Date("2026-10-08"),
        assignees: { create: [{ userId: assignee.id }] },
        reviewers: { create: [{ userId: reviewer.id }] },
      },
    });
    const otherTask = await prisma.task.create({
      data: { projectId: project.id, phaseId: project.phases[0].id, title: "T2", plannedStart: new Date("2026-10-07"), plannedEnd: new Date("2026-10-08") },
    });
    const mkCred = (visibility: "ALL" | "PROJECT" | "USERS", extra: object = {}) =>
      prisma.credential.create({ data: { projectId: project.id, name: visibility, passwordEnc: encryptPassword("p"), visibility, createdById: creator.id, ...extra } });

    const sees = async (credentialId: string, u: { id: string; role: string }) =>
      (await prisma.credential.count({ where: { id: credentialId, ...credentialVisibleWhere(u) } })) > 0;
    const audience = async (credentialId: string) => new Set(await credentialAudienceIds(credentialId));

    // «Solo los del proyecto» (por defecto): PM, asignado, revisor, admin y quien la creó; nadie más.
    const projectCred = await mkCred("PROJECT");
    for (const u of [pm, assignee, reviewer, admin, creator]) assert.ok(await sees(projectCred.id, u), `PROJECT: ${u.name} la ve`);
    for (const u of [outsider, picked]) assert.ok(!(await sees(projectCred.id, u)), `PROJECT: ${u.name} NO la ve`);

    // «Todos»: cualquiera que vea el proyecto.
    const allCred = await mkCred("ALL");
    for (const u of users) assert.ok(await sees(allCred.id, u), `ALL: ${u.name} la ve`);

    // «Personas concretas»: solo las marcadas y quien la creó — ni el PM ni el admin.
    const usersCred = await mkCred("USERS", { allowedUsers: { create: [{ userId: picked.id }] } });
    for (const u of [picked, creator]) assert.ok(await sees(usersCred.id, u), `USERS: ${u.name} la ve`);
    for (const u of [pm, assignee, reviewer, outsider, admin]) assert.ok(!(await sees(usersCred.id, u)), `USERS: ${u.name} NO la ve`);

    // Agregada a una tarea: sus asignados la ven siempre (aunque sea «Personas concretas»).
    const linked = await mkCred("USERS", { allowedUsers: { create: [{ userId: picked.id }] }, tasks: { create: [{ taskId: task.id }] } });
    assert.ok(await sees(linked.id, assignee), "asignado de la tarea la ve");
    assert.ok(!(await sees(linked.id, reviewer)), "el revisor de la tarea no la ve por estar en la tarea");
    await prisma.credentialTask.create({ data: { credentialId: usersCred.id, taskId: otherTask.id } }); // tarea sin asignados: no suma a nadie
    assert.ok(!(await sees(usersCred.id, outsider)));

    // Destinatarios del aviso = misma regla (solo usuarios de este script: los demás de la base pueden ser admin).
    const mine = new Set(users.map((u) => u.id));
    const onlyMine = (s: Set<string>) => new Set([...s].filter((id) => mine.has(id)));
    assert.deepEqual(onlyMine(await audience(linked.id)), new Set([picked.id, creator.id, assignee.id]));

    // Proyecto oculto: solo su admin-PM; nadie más, ni con «Todos».
    await prisma.project.update({ where: { id: project.id }, data: { hidden: true } });
    for (const u of users) assert.ok(!(await sees(allCred.id, u)), `oculto: ${u.name} NO la ve`);
    await prisma.project.update({ where: { id: project.id }, data: { hidden: false } });

    // Usuario inactivo: no recibe avisos.
    await prisma.user.update({ where: { id: picked.id }, data: { active: false } });
    assert.ok(!(await audience(usersCred.id)).has(picked.id), "inactivo fuera de los avisos");

    // 3) Acciones reales (actor de confianza, como la API): paso, ajuste, quitar e historial.
    //    Los usuarios de prueba no tienen teléfono: no sale ningún WhatsApp.
    await prisma.user.update({ where: { id: picked.id }, data: { active: true } });
    const { createCredential, linkCredential, unlinkCredential, getCredentialDetails, recordCredentialEvent, getCredentialAccessLog } = await import("../src/app/(app)/credentials/actions");
    const step = await prisma.taskStep.create({ data: { taskId: task.id, description: "Paso", order: 0 } });
    const item = await prisma.adjustmentItem.create({ data: { taskId: task.id, description: "Ajuste", order: 0 } });
    const pmActor = trustedActor({ id: pm.id, role: pm.role });
    const created = await createCredential({ name: "En paso", password: "s3creta", visibility: "USERS", userIds: [picked.id] }, { stepId: step.id }, pmActor);
    assert.ok(created.ok, "crear en un paso");
    const credId = created.ok ? created.id : "";
    assert.equal(await prisma.credentialTask.count({ where: { credentialId: credId, taskId: task.id } }), 1, "el paso arrastra la tarea");
    assert.equal(await prisma.credentialStep.count({ where: { credentialId: credId, stepId: step.id } }), 1);
    assert.ok(await sees(credId, assignee), "asignado de la tarea la ve por el paso");
    const linkedToItem = await linkCredential(credId, { adjustmentItemId: item.id }, pmActor);
    assert.ok(linkedToItem.ok && !linkedToItem.duplicate, "agregar a un ajuste");
    assert.ok((await linkCredential(credId, { adjustmentItemId: item.id }, pmActor)).ok, "repetir no falla");
    assert.ok((await unlinkCredential(credId, { stepId: step.id }, pmActor)).ok);
    assert.equal(await prisma.credentialTask.count({ where: { credentialId: credId } }), 1, "quitar del paso la deja en la tarea");
    assert.ok((await unlinkCredential(credId, { taskId: task.id }, pmActor)).ok);
    assert.equal(await prisma.credentialAdjustmentItem.count({ where: { credentialId: credId } }), 0, "quitar de la tarea la saca de sus ajustes");
    assert.ok(!(await sees(credId, assignee)), "sin la tarea, el asignado deja de verla");
    const outsiderActor = trustedActor({ id: outsider.id, role: outsider.role });
    assert.ok(!(await getCredentialDetails(credId, outsiderActor)).ok, "sin acceso: no hay detalle");
    const details = await getCredentialDetails(credId, trustedActor({ id: picked.id, role: picked.role }));
    assert.ok(details.ok && details.credential.password === "s3creta", "con acceso: ve la contraseña");
    await recordCredentialEvent(credId, "COPY_PASSWORD", trustedActor({ id: picked.id, role: picked.role }));
    const log = await getCredentialAccessLog(credId, pmActor);
    assert.ok(log.ok && log.entries.some((e) => e.event === "VIEW") && log.entries.some((e) => e.event === "COPY_PASSWORD" && e.userName === picked.name), "historial con abrió y copió");
    assert.ok(!(await getCredentialAccessLog(credId, trustedActor({ id: picked.id, role: picked.role }))).ok, "el historial solo lo ve quien administra");

    console.log("verify-credentials: OK (cifrado, visibilidad PROJECT/ALL/USERS, tareas, pasos, ajustes, proyecto oculto, avisos, historial)");
  } finally {
    await deleteTestProject(project.id);
    await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
