import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { deleteTestProject } from "./verifyCleanup";
import { encryptPassword } from "../src/lib/credentialCrypto";
import { DELETED_USER_NAME, deleteUserPermanently, getUserDeletionSummary } from "../src/lib/userDeletion";

async function main() {
  const stamp = Date.now();
  const mk = (name: string, extra: { active?: boolean } = {}) =>
    prisma.user.create({ data: { name: `__vd_${name}`, username: `__vd_${name}_${stamp}`, email: `__vd_${name}_${stamp}@prueba.local`, phone: `57300${String(stamp).slice(-7)}${name.length}`, passwordHash: "x", ...extra } });
  const [admin, leaving, receiver, other, inactive, quiet] = await Promise.all([mk("admin"), mk("leaving"), mk("receiver"), mk("other"), mk("inactive", { active: false }), mk("quiet")]);
  const users = [admin, leaving, receiver, other, inactive, quiet];
  const project = await prisma.project.create({
    data: { name: `__verify-delete-user-${stamp}__`, startDate: new Date("2026-10-12"), pmId: leaving.id, phases: { create: [{ name: "F1", order: 0 }] } },
    include: { phases: true },
  });
  const phaseId = project.phases[0].id;

  try {
    const mkTask = (title: string, status: "NOT_STARTED" | "COMPLETED" = "NOT_STARTED") =>
      prisma.task.create({ data: { projectId: project.id, phaseId, title, status, plannedStart: new Date("2026-10-12"), plannedEnd: new Date("2026-10-13") } });
    const [tPlain, tDup, tReview, tConflict, tDone] = await Promise.all([mkTask("simple"), mkTask("duplicada"), mkTask("revisa"), mkTask("conflicto"), mkTask("hecha", "COMPLETED")]);
    await prisma.taskAssignee.createMany({
      data: [
        { taskId: tPlain.id, userId: leaving.id },
        { taskId: tDup.id, userId: leaving.id },
        { taskId: tDup.id, userId: receiver.id },
        { taskId: tConflict.id, userId: receiver.id },
        { taskId: tDone.id, userId: leaving.id },
      ],
    });
    await prisma.taskReviewer.createMany({ data: [{ taskId: tReview.id, userId: leaving.id }, { taskId: tConflict.id, userId: leaving.id }] });

    const mkCred = (name: string, visibility: "ME" | "PROJECT" | "USERS", createdById: string) =>
      prisma.credential.create({ data: { projectId: project.id, name, passwordEnc: encryptPassword("p"), visibility, createdById } });
    const [cMine, cPrivate, cShared] = await Promise.all([mkCred("propia", "PROJECT", leaving.id), mkCred("privada", "ME", leaving.id), mkCred("ajena", "USERS", other.id)]);
    await prisma.credentialUser.create({ data: { credentialId: cShared.id, userId: leaving.id } });

    const comment = await prisma.internalMessage.create({ data: { projectId: project.id, authorId: leaving.id, body: "comentario de prueba" } });
    await prisma.notification.create({ data: { userId: leaving.id, type: "SYSTEM", message: "aviso de prueba" } });

    assert.deepEqual(await getUserDeletionSummary(leaving.id), { pmProjects: 1, activeTasks: 4, credentials: 3 });

    const self = await deleteUserPermanently({ userId: leaving.id, actorId: leaving.id });
    assert.ok(!self.ok, "nadie se elimina a sí mismo");
    const noPm = await deleteUserPermanently({ userId: leaving.id, actorId: admin.id, tasksToId: receiver.id });
    assert.ok(!noPm.ok, "sin nuevo PM no se elimina");
    const badTarget = await deleteUserPermanently({ userId: leaving.id, actorId: admin.id, newPmId: receiver.id, tasksToId: inactive.id });
    assert.ok(!badTarget.ok, "el destino debe estar activo");
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: leaving.id } })).name, "__vd_leaving", "un intento fallido no cambia la cuenta");
    assert.equal(await prisma.taskAssignee.count({ where: { userId: leaving.id } }), 3, "un intento fallido no cambia las tareas");
    assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).pmId, leaving.id, "un intento fallido no cambia el PM");

    const done = await deleteUserPermanently({ userId: leaving.id, actorId: admin.id, newPmId: receiver.id, tasksToId: receiver.id, credentialsToId: receiver.id });
    assert.ok(done.ok);

    assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).pmId, receiver.id, "el proyecto pasa al nuevo PM");
    const assigneesOf = async (taskId: string) => (await prisma.taskAssignee.findMany({ where: { taskId }, select: { userId: true } })).map((r) => r.userId);
    const reviewersOf = async (taskId: string) => (await prisma.taskReviewer.findMany({ where: { taskId }, select: { userId: true } })).map((r) => r.userId);
    assert.deepEqual(await assigneesOf(tPlain.id), [receiver.id], "la tarea vigente pasa al destino");
    assert.deepEqual(await assigneesOf(tDup.id), [receiver.id], "sin duplicar al destino");
    assert.deepEqual(await reviewersOf(tReview.id), [receiver.id], "el papel de revisor pasa al destino");
    assert.deepEqual(await reviewersOf(tConflict.id), [], "el destino ya era asignado: no queda además como revisor");
    assert.deepEqual(await assigneesOf(tDone.id), [leaving.id], "la tarea completada conserva a la persona");

    assert.equal((await prisma.credential.findUniqueOrThrow({ where: { id: cMine.id } })).createdById, receiver.id);
    assert.equal((await prisma.credential.findUniqueOrThrow({ where: { id: cPrivate.id } })).createdById, receiver.id, "la «Solo yo» pasa al destino");
    assert.deepEqual((await prisma.credentialUser.findMany({ where: { credentialId: cShared.id } })).map((r) => r.userId), [receiver.id], "el acceso pasa al destino");

    const gone = await prisma.user.findUniqueOrThrow({ where: { id: leaving.id }, omit: { phone: false, email: false, passwordHash: false } });
    assert.equal(gone.name, DELETED_USER_NAME);
    assert.equal(gone.username, `eliminado-${leaving.id}`);
    assert.equal(gone.email, null);
    assert.equal(gone.phone, null);
    assert.equal(gone.active, false);
    assert.ok(gone.deletedAt);
    assert.notEqual(gone.passwordHash, "x");

    assert.ok(await prisma.internalMessage.findUnique({ where: { id: comment.id } }), "el comentario se conserva");
    assert.equal(await prisma.notification.count({ where: { userId: leaving.id } }), 0, "sus avisos se borran");
    const notice = await prisma.notification.findMany({ where: { userId: receiver.id } });
    assert.equal(notice.length, 1, "un solo aviso para quien recibe");
    assert.equal(notice[0].message, "Recibió 1 proyecto como PM, 2 tareas y 3 contraseñas de una cuenta eliminada.");
    assert.ok(!notice[0].message.includes("leaving"), "el aviso no nombra a la persona");

    const reuse = await prisma.user.create({ data: { name: "__vd_reuse", username: `__vd_leaving_${stamp}`, passwordHash: "x" } });
    users.push(reuse);
    const again = await deleteUserPermanently({ userId: leaving.id, actorId: admin.id });
    assert.ok(!again.ok, "no se elimina dos veces");

    const tOther = await mkTask("de otra persona");
    await prisma.taskAssignee.create({ data: { taskId: tOther.id, userId: other.id } });
    const cOtherPrivate = await mkCred("privada de otra", "ME", other.id);
    const cOtherShared = await mkCred("del proyecto", "PROJECT", other.id);
    const drop = await deleteUserPermanently({ userId: other.id, actorId: admin.id });
    assert.ok(drop.ok, "sin proyectos como PM no hace falta nuevo PM");
    assert.deepEqual(await assigneesOf(tOther.id), [], "«No reasignar» quita a la persona de la tarea");
    assert.equal(await prisma.credential.findUnique({ where: { id: cOtherPrivate.id } }), null, "«No reasignar» elimina la «Solo yo»");
    assert.equal((await prisma.credential.findUniqueOrThrow({ where: { id: cOtherShared.id } })).createdById, null, "la del proyecto queda sin creador");
    assert.equal((await prisma.credential.findUniqueOrThrow({ where: { id: cShared.id } })).createdById, null);

    const empty = await deleteUserPermanently({ userId: quiet.id, actorId: admin.id });
    assert.ok(empty.ok, "una cuenta sin nada se elimina solo con la confirmación");
    assert.equal(await prisma.notification.count({ where: { userId: admin.id } }), 0, "sin reasignación no hay avisos");

    console.log("verify-delete-user: OK (validaciones, PM, tareas, contraseñas, «No reasignar», historial, cuenta vacía)");
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
