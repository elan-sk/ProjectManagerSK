import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";
const d = (iso: string) => new Date(iso + "T00:00:00Z");
async function main() {
  const hash = await bcrypt.hash("f2-pass-123", 10);
  const admin = await prisma.user.create({ data: { name: "F2 Admin", username: "__f2_admin__", passwordHash: hash, role: "ADMIN" } });
  const member = await prisma.user.create({ data: { name: "F2 Miembro", username: "__f2_member__", passwordHash: hash, role: "MEMBER" } });
  const project = await prisma.project.create({
    data: { name: "__F2 Proyecto__", clientName: "Cliente F2", startDate: d("2026-09-01"), pmId: admin.id, phases: { create: [{ name: "Fase F2", order: 0 }] } },
    include: { phases: true },
  });
  const phaseId = project.phases[0].id;
  const mk = (title: string, s: string, e: string, status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" = "NOT_STARTED") =>
    prisma.task.create({ data: { projectId: project.id, phaseId, title, plannedStart: d(s), plannedEnd: d(e), status, ...(status === "COMPLETED" ? { actualStart: d(s), actualEnd: new Date() } : {}) } });
  const t1 = await mk("Tarea F2 uno", "2026-09-21", "2026-09-25", "IN_PROGRESS");
  const t2 = await mk("Tarea F2 dos", "2026-09-22", "2026-09-26");
  const t3 = await mk("Tarea F2 tres", "2026-09-23", "2026-09-30");
  const t4 = await mk("Tarea F2 completada", "2026-09-14", "2026-09-19", "COMPLETED");
  await prisma.taskAssignee.createMany({ data: [t1, t2, t3, t4].map((t) => ({ taskId: t.id, userId: admin.id })) });
  await prisma.taskAssignee.create({ data: { taskId: t1.id, userId: member.id } });
  console.log(JSON.stringify({ projectId: project.id, t1: t1.id, t2: t2.id, t3: t3.id, t4: t4.id, admin: admin.id, member: member.id }));
  process.exit(0);
}
main();
