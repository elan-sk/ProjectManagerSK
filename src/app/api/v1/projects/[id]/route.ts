import { NextResponse } from "next/server";
import { projectVisibleTo } from "@/lib/visibility";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/apiAuth";
import { revalidatePath } from "next/cache";
import { runAction, withAuth, withBody } from "@/lib/apiResult";
import { archiveProject } from "@/app/(app)/projects/[id]/actions";
import { setProjectArchived, setProjectHidden } from "@/app/(app)/projects/[id]/taskOps";
import { updateProjectWhatsAppGroup } from "@/app/(app)/projects/[id]/definitionActions";
import { getBottlenecks, getProjectDelaySummary } from "@/lib/delays";
import { getProjectForecast, scheduleForApi } from "@/lib/scheduleForecast";
import { PUBLIC_USER_SELECT } from "@/lib/publicUser";
import { getProjectAdmin } from "@/lib/permissions";

const FILE_SELECT = { id: true, fileUrl: true, fileName: true, mimeType: true } as const;
const FILE_SELECT_WITH_KIND = { ...FILE_SELECT, kind: true } as const;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  if (!(await projectVisibleTo(id, auth.actor))) return NextResponse.json({ error: "No existe." }, { status: 404 });
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      pm: { select: PUBLIC_USER_SELECT },
      phases: { orderBy: { order: "asc" } },
      // Definición completa: lo que la app muestra en la pestaña Definición.
      objectives: { orderBy: { order: "asc" } },
      requirements: { orderBy: { order: "asc" }, include: { objectives: { select: { id: true, title: true } } } },
      attachments: { include: { uploadedBy: { select: { name: true } } }, orderBy: { uploadedAt: "asc" } },
      links: { orderBy: { createdAt: "asc" } },
      repos: { orderBy: { createdAt: "asc" } },
      tasks: {
        include: {
          assignees: { include: { user: { select: PUBLIC_USER_SELECT } } },
          // Todos los archivos de cada tarea (versión liviana): el detalle va en GET /tasks/:id, /design y /threads.
          attachments: { select: FILE_SELECT_WITH_KIND },
          adjustmentItems: { orderBy: { order: "asc" }, select: { id: true, description: true, attachments: { select: FILE_SELECT_WITH_KIND } } },
          reviewRounds: {
            orderBy: { roundNumber: "asc" },
            select: { id: true, roundNumber: true, deliverables: { select: FILE_SELECT }, checks: { select: { id: true, title: true, evidence: { select: FILE_SELECT } } } },
          },
        },
      },
    },
  });
  if (!project) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const [bottlenecks, delays, forecast] = await Promise.all([
    getBottlenecks(id),
    getProjectDelaySummary(id),
    getProjectForecast(id),
  ]);

  // schedule: retraso u holgura si sigue al ritmo actual (spec 003).
  return NextResponse.json({ ...project, bottlenecks, delays, schedule: scheduleForApi(forecast) });
}

// Punto 3.1 (skill dev-project-definer): completar la descripción/fechas del
// proyecto una vez creado — la info que no encaje en objetivos/requerimientos/
// fases va acá, nunca se descarta solo por no tener un campo propio.
// Además, todo lo que la persona edita en la app: nombre, ícono, fechas, cliente,
// repo, grupo de WhatsApp, ocultar (solo el admin que es PM) y archivar (PM o admin).
// `null` vacía un campo opcional.
const updateProjectSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().optional(),
  startDate: z.coerce.date().optional(),
  targetEndDate: z.coerce.date().nullable().optional(),
  clientName: z.string().trim().nullable().optional(),
  repoUrl: z.string().url().nullable().optional(),
  color: z.string().nullable().optional(),
  iconUrl: z.string().regex(/^\/uploads\/[A-Za-z0-9._-]+$/, "iconUrl debe ser la url que devolvió /api/upload.").nullable().optional(),
  whatsappGroupJid: z.string().nullable().optional(),
  hidden: z.boolean().optional(),
  archived: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withBody(request, updateProjectSchema, async (actor, data) => {
    if (!(await getProjectAdmin(id, actor))) return { ok: false, status: 403, error: "Solo el PM de este proyecto o un administrador pueden editarlo." };
    const { hidden, archived, whatsappGroupJid, ...fields } = data;
    if (hidden !== undefined) {
      const r = await setProjectHidden(id, hidden, actor);
      if (!r.ok) return r;
    }
    if (archived !== undefined) {
      const r = await setProjectArchived(id, archived, actor);
      if (!r.ok) return r;
    }
    if (whatsappGroupJid !== undefined) {
      const r = await updateProjectWhatsAppGroup(id, whatsappGroupJid ?? "", actor);
      if (!r.ok) return r;
    }
    if (fields.clientName === "") fields.clientName = null;
    const project = Object.keys(fields).length > 0 ? await prisma.project.update({ where: { id }, data: fields }) : await prisma.project.findUniqueOrThrow({ where: { id } });
    revalidatePath(`/projects/${id}`);
    revalidatePath("/projects");
    return { ok: true, ...project };
  });
}

// Eliminar el proyecto (solo administrador). Por dentro es el mismo borrado suave de la app
// (status ARCHIVED, desaparece para todos); para mandarlo al historial usar PATCH { archived: true }.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(request, (actor) => runAction(() => archiveProject(id, actor)));
}
