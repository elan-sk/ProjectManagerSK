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
  const childIds: string[] = [];
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
    const mkCred = (visibility: "ME" | "ALL" | "PROJECT" | "USERS", extra: object = {}) =>
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

    // «Personas concretas»: solo las marcadas — ni el PM, ni el admin, ni quien la creó si no se marcó.
    const usersCred = await mkCred("USERS", { allowedUsers: { create: [{ userId: picked.id }] } });
    assert.ok(await sees(usersCred.id, picked), "USERS: la persona marcada la ve");
    for (const u of [pm, assignee, reviewer, outsider, admin, creator]) assert.ok(!(await sees(usersCred.id, u)), `USERS: ${u.name} NO la ve`);
    const usersWithCreator = await mkCred("USERS", { allowedUsers: { create: [{ userId: creator.id }] } });
    assert.ok(await sees(usersWithCreator.id, creator), "USERS: quien la creó la ve si se marcó");

    // «Solo yo»: únicamente quien la creó — ni admin, ni PM, ni el asignado de la tarea donde está.
    const meCred = await mkCred("ME", { tasks: { create: [{ taskId: task.id }] } });
    assert.ok(await sees(meCred.id, creator), "ME: quien la creó la ve");
    for (const u of [pm, assignee, reviewer, outsider, picked, admin]) assert.ok(!(await sees(meCred.id, u)), `ME: ${u.name} NO la ve`);
    assert.deepEqual([...(await audience(meCred.id))], [creator.id], "ME: la audiencia es solo quien la creó");

    // Agregada a una tarea: sus asignados la ven siempre (aunque sea «Personas concretas»).
    const linked = await mkCred("USERS", { allowedUsers: { create: [{ userId: picked.id }] }, tasks: { create: [{ taskId: task.id }] } });
    assert.ok(await sees(linked.id, assignee), "asignado de la tarea la ve");
    assert.ok(!(await sees(linked.id, reviewer)), "el revisor de la tarea no la ve por estar en la tarea");
    await prisma.credentialTask.create({ data: { credentialId: usersCred.id, taskId: otherTask.id } }); // tarea sin asignados: no suma a nadie
    assert.ok(!(await sees(usersCred.id, outsider)));

    // Destinatarios del aviso = misma regla (solo usuarios de este script: los demás de la base pueden ser admin).
    const mine = new Set(users.map((u) => u.id));
    const onlyMine = (s: Set<string>) => new Set([...s].filter((id) => mine.has(id)));
    assert.deepEqual(onlyMine(await audience(linked.id)), new Set([picked.id, assignee.id]));

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
    const { createCredential, updateCredential, linkCredential, unlinkCredential, getCredentialDetails, recordCredentialEvent, getCredentialAccessLog } = await import("../src/app/(app)/credentials/actions");
    const step = await prisma.taskStep.create({ data: { taskId: task.id, description: "Paso", order: 0 } });
    const item = await prisma.adjustmentItem.create({ data: { taskId: task.id, description: "Ajuste", order: 0 } });
    const pmActor = trustedActor({ id: pm.id, role: pm.role });
    const created = await createCredential({ name: "En paso", password: "s3creta", visibility: "USERS", userIds: [picked.id, pm.id] }, { stepId: step.id }, pmActor); // el PM se marca: sin eso perdería el acceso al crearla
    assert.ok(created.ok, "crear en un paso");
    // «Personas concretas» nunca queda vacía: ni lista vacía, ni ids que no existen.
    assert.ok(!(await createCredential({ name: "Vacía", password: "x", visibility: "USERS", userIds: [] }, { projectId: project.id }, pmActor)).ok, "USERS sin personas se rechaza");
    assert.ok(!(await createCredential({ name: "Inventada", password: "x", visibility: "USERS", userIds: ["no-existe"] }, { projectId: project.id }, pmActor)).ok, "USERS con ids inexistentes se rechaza");
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

    // 3) Subproyectos (spec 004): un hijo usa las contraseñas del principal; no las de un hermano, ni el principal las del hijo.
    const { projectMedia } = await import("../src/lib/projectMedia");
    const mkChild = async (name: string) => {
      const c = await prisma.project.create({
        data: { name: `__verify-credentials-${name}-${stamp}__`, startDate: new Date("2026-10-07"), pmId: pm.id, parentId: project.id, phases: { create: [{ name: "F1", order: 0 }] } },
        include: { phases: true },
      });
      childIds.push(c.id);
      return c;
    };
    const [child, sibling] = [await mkChild("hijo"), await mkChild("hermano")];
    const childTask = await prisma.task.create({ data: { projectId: child.id, phaseId: child.phases[0].id, title: "TH", plannedStart: new Date("2026-10-07"), plannedEnd: new Date("2026-10-08") } });
    const parentCred = await mkCred("ALL");
    const siblingCred = await prisma.credential.create({ data: { projectId: sibling.id, name: "hermano", passwordEnc: encryptPassword("p"), visibility: "ALL", createdById: creator.id } });
    const childCred = await prisma.credential.create({ data: { projectId: child.id, name: "hijo", passwordEnc: encryptPassword("p"), visibility: "ALL", createdById: creator.id } });
    assert.ok((await linkCredential(parentCred.id, { taskId: childTask.id }, pmActor)).ok, "el hijo recibe una contraseña del principal");
    assert.ok(!(await linkCredential(siblingCred.id, { taskId: childTask.id }, pmActor)).ok, "no la de un hermano");
    assert.ok(!(await linkCredential(childCred.id, { taskId: otherTask.id }, pmActor)).ok, "el principal no recibe las del hijo");
    const childMedia = (await projectMedia(child.id, pmActor)).map((i) => i.url);
    assert.ok(childMedia.includes(`credential:${parentCred.id}`) && !childMedia.includes(`credential:${siblingCred.id}`), "galería del hijo: principal sí, hermano no");
    assert.ok(!(await projectMedia(project.id, pmActor)).some((i) => i.url === `credential:${childCred.id}`), "galería del principal: sin las del hijo");
    assert.ok(!(await projectMedia(child.id, pmActor, { withCredentials: false })).some((i) => i.mimeType.includes("credential")), "comentarios: sin contraseñas");

    // 4) Mover de proyecto: hace falta ser PM o administrador del destino; se quita de las tareas que no pueden tenerla allá.
    const other = await prisma.project.create({ data: { name: `__verify-credentials-otro-${stamp}__`, startDate: new Date("2026-10-07"), pmId: outsider.id } });
    childIds.push(other.id);
    const moveCred = await mkCred("ALL", { tasks: { create: [{ taskId: task.id }, { taskId: childTask.id }] } });
    const fields = { name: "ALL", visibility: "ALL" as const };
    assert.ok(!(await updateCredential(moveCred.id, { ...fields, projectId: other.id }, pmActor)).ok, "el PM de origen no la pasa a un proyecto que no maneja");
    assert.ok((await updateCredential(moveCred.id, { ...fields, projectId: child.id }, pmActor)).ok, "el PM la pasa a su subproyecto");
    const movedTaskIds = async () => (await prisma.credentialTask.findMany({ where: { credentialId: moveCred.id } })).map((t) => t.taskId);
    assert.deepEqual(await movedTaskIds(), [childTask.id], "en el subproyecto conserva solo la tarea del subproyecto");
    assert.ok((await updateCredential(moveCred.id, { ...fields, projectId: other.id }, trustedActor({ id: admin.id, role: admin.role }))).ok, "un administrador la pasa a cualquier proyecto");
    assert.equal((await prisma.credential.findUniqueOrThrow({ where: { id: moveCred.id } })).projectId, other.id);
    assert.deepEqual(await movedTaskIds(), [], "en un proyecto ajeno queda sin tareas del anterior");

    // 5) Avisos según quién puede verla: «Personas concretas» solo a las marcadas y «Solo yo» a nadie,
    // aunque al agregarla a una tarea o cambiarla de proyecto la vean los responsables de la tarea.
    const notified = async (id: string) => (await prisma.notification.findMany({ where: { credentialId: id } })).map((n) => n.userId);
    const quietUsers = await mkCred("USERS", { allowedUsers: { create: [{ userId: picked.id }, { userId: admin.id }] } });
    assert.ok((await linkCredential(quietUsers.id, { taskId: task.id }, trustedActor({ id: admin.id, role: admin.role }))).ok, "un administrador marcado la agrega a la tarea");
    assert.ok(!(await notified(quietUsers.id)).includes(assignee.id), "Personas concretas: no avisa al responsable de la tarea");
    const quietMe = await prisma.credential.create({ data: { projectId: other.id, name: "ME", passwordEnc: encryptPassword("p"), visibility: "ME", createdById: pm.id } });
    await prisma.credentialTask.create({ data: { credentialId: quietMe.id, taskId: task.id } });
    await updateCredential(quietMe.id, { name: "ME", visibility: "ME", projectId: project.id }, trustedActor({ id: admin.id, role: admin.role }));
    assert.deepEqual(await notified(quietMe.id), [], "Solo yo: cambiarla de proyecto no avisa a nadie");

    console.log("verify-credentials: OK (cifrado, visibilidad PROJECT/ALL/USERS, tareas, pasos, ajustes, proyecto oculto, avisos, historial, subproyectos, mover de proyecto)");
  } finally {
    for (const id of childIds) await deleteTestProject(id);
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
