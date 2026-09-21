import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiUser, safeJson } from "@/lib/apiAuth";
import { PUBLIC_USER_SELECT } from "@/lib/publicUser";
import { visibleProjectWhere } from "@/lib/permissions";
import { getAppCountryCode } from "@/lib/appSettings";

export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const projects = await prisma.project.findMany({
    where: visibleProjectWhere(auth.actor),
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
  startDate: z.coerce.date(),
  pmId: z.string().min(1),
});

export async function POST(request: Request) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const parsedBody = await safeJson(request);
  if ("error" in parsedBody) return parsedBody.error;

  const parsed = createProjectSchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const project = await prisma.project.create({
    data: { ...parsed.data, countryCode: await getAppCountryCode(), phases: { create: [{ name: "General", order: 0 }] } },
    include: { phases: true },
  });
  return NextResponse.json(project, { status: 201 });
}
