import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { buildDailyDigestText, meetingReminderText } from "../src/lib/notifications";
import { LIVE_PROJECT_WHERE } from "../src/lib/permissions";

async function main() {
  assert.match(meetingReminderText("Kickoff", "martes 18 de noviembre, 10:00 a. m.", "https://meet.google.com/abc"), /Recordatorio de reunión[\s\S]*Kickoff[\s\S]*https:\/\/meet\.google\.com\/abc/);

  const task = await prisma.task.findFirstOrThrow({
    where: { assignees: { some: { user: { active: true } } }, project: { hidden: false, ...LIVE_PROJECT_WHERE } },
    select: { id: true, title: true, meetingUrl: true, meetingAt: true, assignees: { select: { user: { select: { id: true, name: true } } }, take: 1 } },
  });
  const user = task.assignees[0].user;
  const inOneHour = new Date(Date.now() + 3600_000);
  await prisma.task.update({ where: { id: task.id }, data: { meetingUrl: "https://meet.google.com/zz-prueba", meetingAt: inOneHour } });
  try {
    const text = await buildDailyDigestText(user.id, user.name);
    assert.ok(text?.includes("📅 *Reuniones de hoy:*"), "el resumen diario lista la reunión de hoy");
    assert.ok(text?.includes(task.title));

    await prisma.task.update({ where: { id: task.id }, data: { meetingAt: new Date(Date.now() + 3 * 24 * 3600_000) } });
    const later = await buildDailyDigestText(user.id, user.name);
    assert.ok(!later?.includes(task.title) || !later.includes("Reuniones de hoy"), "una reunión de otro día no aparece");
  } finally {
    await prisma.task.update({ where: { id: task.id }, data: { meetingUrl: task.meetingUrl, meetingAt: task.meetingAt } });
  }
  console.log("OK: recordatorio con link y reuniones de hoy en el resumen diario.");
}

main().finally(() => prisma.$disconnect());
