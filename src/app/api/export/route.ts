import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// Backup/restauración técnica (punto confirmado con el usuario) — un JSON
// completo de proyecto(s): fases, tareas, asignados, checklist y
// dependencias. Referencias por email/título (no ids crudos de esta base),
// para que el archivo se pueda re-importar en otra instalación. Deliberado:
// NO incluye adjuntos (archivos binarios) ni notificaciones/push — eso es
// datos de sesión/dispositivo, no la estructura del proyecto.
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Solo un administrador puede exportar datos." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const rawIds = searchParams.getAll("projectIds").flatMap((v) => v.split(",")).filter(Boolean);
  const projectIds = rawIds.length > 0 ? rawIds : undefined;

  const projects = await prisma.project.findMany({
    where: projectIds ? { id: { in: projectIds } } : undefined,
    orderBy: { name: "asc" },
    include: {
      pm: { select: { username: true } },
      phases: { orderBy: { order: "asc" } },
      tasks: {
        include: {
          phase: { select: { name: true } },
          assignees: { include: { user: { select: { username: true } } } },
          steps: { orderBy: { order: "asc" } },
          dependsOn: { include: { predecessor: { select: { title: true } } } },
        },
      },
    },
  });

  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    projects: projects.map((p) => ({
      name: p.name,
      clientName: p.clientName,
      countryCode: p.countryCode,
      status: p.status,
      startDate: p.startDate.toISOString(),
      pmUsername: p.pm.username,
      phases: p.phases.map((ph) => ({ name: ph.name, order: ph.order })),
      tasks: p.tasks.map((t) => ({
        phaseName: t.phase.name,
        type: t.type,
        title: t.title,
        description: t.description,
        status: t.status,
        riskLevel: t.riskLevel,
        plannedStart: t.plannedStart.toISOString(),
        plannedEnd: t.plannedEnd.toISOString(),
        actualStart: t.actualStart ? t.actualStart.toISOString() : null,
        actualEnd: t.actualEnd ? t.actualEnd.toISOString() : null,
        assigneeUsernames: t.assignees.map((a) => a.user.username),
        steps: t.steps.map((s) => ({ description: s.description, done: s.done, order: s.order })),
        dependsOn: t.dependsOn.map((d) => ({ predecessorTitle: d.predecessor.title, type: d.type })),
      })),
    })),
  };

  const scope = projectIds ? `${projectIds.length}proyecto(s)` : "todos";
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="proyectos-export-${scope}-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
