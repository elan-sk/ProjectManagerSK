import "dotenv/config";
import { prisma } from "../src/lib/prisma";

// Borra TODO menos la tabla User — para arrancar en limpio en el hosting
// nuevo conservando las cuentas existentes (mismas contraseñas de siempre).
// Corre contra la DATABASE_URL que esté puesta en .env en ese momento —
// confirmar que apunta a la base correcta ANTES de ejecutar esto.
//
// Project ya cascadea (onDelete: Cascade) hacia fases, tareas, objetivos,
// requerimientos, links/adjuntos, etiquetas, rondas de revisión y todo lo
// que cuelga de una tarea — no hace falta borrarlas una por una. El resto
// son tablas independientes de Project/Task, se borran explícitas.
async function main() {
  const projectCount = await prisma.project.count();
  console.log(`Borrando ${projectCount} proyecto(s) y todo lo que cuelga de ellos...`);
  await prisma.project.deleteMany();

  await prisma.notification.deleteMany();
  await prisma.botMessage.deleteMany();
  await prisma.whatsAppQueueItem.deleteMany();
  await prisma.pushSubscription.deleteMany();
  await prisma.googleCalendarConnection.deleteMany();
  await prisma.testTemplate.deleteMany(); // cascadea TestTemplateItem
  await prisma.responseCategory.deleteMany(); // cascadea ResponseTemplate
  await prisma.tagCategory.deleteMany(); // cascadea Tag/TaskTag (ya vacíos vía Project igual)
  await prisma.holiday.deleteMany();
  await prisma.appSetting.deleteMany();

  const usersLeft = await prisma.user.count();
  console.log(`Listo. Quedan ${usersLeft} usuario(s), todo lo demás está vacío.`);
}

main().then(() => process.exit(0));
