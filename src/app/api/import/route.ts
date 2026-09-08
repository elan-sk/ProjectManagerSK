import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// Import "completo" (punto confirmado con el usuario) — pero deliberadamente
// SOLO crea proyectos nuevos, nunca sobrescribe uno existente: es la única
// forma de que "importar" no pueda destruir datos reales por accidente
// (regla dura de /solo). Si un proyecto con ese nombre ya existe, igual se
// crea uno nuevo — el usuario decide después qué hacer con el duplicado.

const stepSchema = z.object({ description: z.string().min(1), done: z.boolean(), order: z.number() });
const dependsOnSchema = z.object({
  predecessorTitle: z.string().min(1),
  type: z.enum(["FINISH_TO_START", "START_TO_START"]),
});
const taskSchema = z.object({
  phaseName: z.string().min(1),
  type: z.enum(["SIMPLE", "CHECKLIST", "MILESTONE", "MEETING", "QA", "ADJUSTMENT"]),
  title: z.string().min(1),
  description: z.string().nullable(),
  status: z.enum(["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "COMPLETED"]),
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH"]),
  plannedStart: z.string(),
  plannedEnd: z.string(),
  actualStart: z.string().nullable(),
  actualEnd: z.string().nullable(),
  assigneeEmails: z.array(z.string()),
  steps: z.array(stepSchema),
  dependsOn: z.array(dependsOnSchema),
});
const projectSchema = z.object({
  name: z.string().min(1),
  clientName: z.string().nullable(),
  countryCode: z.string().length(2),
  status: z.enum(["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED"]),
  startDate: z.string(),
  pmEmail: z.string(),
  phases: z.array(z.object({ name: z.string().min(1), order: z.number() })),
  tasks: z.array(taskSchema),
});
const importSchema = z.object({ version: z.number(), projects: z.array(projectSchema) });

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/settings?importError=No+autorizado", request.url));
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.redirect(new URL("/settings?importError=Falta+el+archivo", request.url));

  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    return NextResponse.redirect(new URL("/settings?importError=El+archivo+no+es+JSON+válido", request.url));
  }

  const parsed = importSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.redirect(new URL("/settings?importError=El+archivo+no+tiene+el+formato+esperado", request.url));
  }

  let created = 0;
  const failures: string[] = [];

  for (const p of parsed.data.projects) {
    try {
      const pm = await prisma.user.findUnique({ where: { email: p.pmEmail } });
      if (!pm) throw new Error(`no existe un usuario con email ${p.pmEmail} para ser PM`);

      await prisma.$transaction(async (tx) => {
        const project = await tx.project.create({
          data: {
            name: p.name,
            clientName: p.clientName,
            countryCode: p.countryCode,
            status: p.status,
            startDate: new Date(p.startDate),
            pmId: pm.id,
          },
        });

        const phaseIdByName = new Map<string, string>();
        for (const ph of p.phases) {
          const created = await tx.phase.create({ data: { projectId: project.id, name: ph.name, order: ph.order } });
          phaseIdByName.set(ph.name, created.id);
        }

        const taskIdByTitle = new Map<string, string>();
        for (const t of p.tasks) {
          const phaseId = phaseIdByName.get(t.phaseName);
          if (!phaseId) throw new Error(`fase "${t.phaseName}" no encontrada para la tarea "${t.title}"`);
          const assigneeUsers = t.assigneeEmails.length
            ? await tx.user.findMany({ where: { email: { in: t.assigneeEmails } } })
            : [];
          const createdTask = await tx.task.create({
            data: {
              projectId: project.id,
              phaseId,
              type: t.type,
              title: t.title,
              description: t.description,
              status: t.status,
              riskLevel: t.riskLevel,
              plannedStart: new Date(t.plannedStart),
              plannedEnd: new Date(t.plannedEnd),
              actualStart: t.actualStart ? new Date(t.actualStart) : null,
              actualEnd: t.actualEnd ? new Date(t.actualEnd) : null,
              assignees: { create: assigneeUsers.map((u) => ({ userId: u.id })) },
              steps: { create: t.steps.map((s) => ({ description: s.description, done: s.done, order: s.order })) },
            },
          });
          taskIdByTitle.set(t.title, createdTask.id);
        }

        for (const t of p.tasks) {
          const successorId = taskIdByTitle.get(t.title);
          if (!successorId) continue;
          for (const dep of t.dependsOn) {
            const predecessorId = taskIdByTitle.get(dep.predecessorTitle);
            if (!predecessorId) continue;
            await tx.taskDependency.create({ data: { predecessorId, successorId, type: dep.type } });
          }
        }
      });

      created += 1;
    } catch (err) {
      failures.push(`${p.name}: ${(err as Error).message}`);
    }
  }

  const url = new URL("/settings", request.url);
  url.searchParams.set("imported", String(created));
  if (failures.length > 0) url.searchParams.set("importFailed", failures.join(" | "));
  return NextResponse.redirect(url);
}
