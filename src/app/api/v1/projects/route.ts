import { canCreateProjects, NO_CREATE_PROJECT } from "@/lib/permissions";
import { clientFieldsFor } from "@/lib/clients";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiUser, safeJson } from "@/lib/apiAuth";
import { PUBLIC_USER_SELECT } from "@/lib/publicUser";
import { visibleProjectWhere } from "@/lib/permissions";
import { getAppCountryCode } from "@/lib/appSettings";
import { newSubprojectParentError } from "@/lib/subprojectsServer";

export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const projects = await prisma.project.findMany({
    // ?archived=1 → el historial (proyectos archivados); por defecto, solo los del flujo normal.
    where: new URL(request.url).searchParams.get("archived") === "1"
      ? { ...visibleProjectWhere(auth.actor, { includeArchived: true }), archivedAt: { not: null } }
      : visibleProjectWhere(auth.actor),
    include: {
      pm: { select: PUBLIC_USER_SELECT },
      phases: true,
      _count: { select: { tasks: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(projects);
}

const createProjectSchema = z.object({
  name: z.string().min(1),
  clientName: z.string().optional(),
  clientId: z.string().min(1).optional(),
  startDate: z.coerce.date(),
  pmId: z.string().min(1),
  // Spec 004: crearlo ya como subproyecto de este proyecto principal.
  parentId: z.string().min(1).optional(),
});

export async function POST(request: Request) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;
  if (!canCreateProjects(auth.actor)) return NextResponse.json({ error: NO_CREATE_PROJECT }, { status: 403 });

  const parsedBody = await safeJson(request);
  if ("error" in parsedBody) return parsedBody.error;

  const parsed = createProjectSchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.parentId) {
    const error = await newSubprojectParentError(parsed.data.parentId, auth.actor);
    if (error) return NextResponse.json({ error }, { status: error.startsWith("Solo") ? 403 : 400 });
  }

  const { clientId, clientName, ...rest } = parsed.data;
  let client;
  try {
    client = await clientFieldsFor({ clientId, clientName }, auth.actor.id);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
  const project = await prisma.project.create({
    data: { ...rest, ...client, createdById: auth.actor.id, countryCode: await getAppCountryCode(), phases: { create: [{ name: "General", order: 0 }] } },
    include: { phases: true },
  });
  return NextResponse.json(project, { status: 201 });
}
