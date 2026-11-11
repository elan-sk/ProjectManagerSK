import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/apiAuth";
import { runAction, withBody } from "@/lib/apiResult";
import { createTag } from "@/app/(app)/settings/tags/tagActions";

// Categorías de etiqueta globales (color + emoji) — lo que hace falta para
// resolver `categoryId` antes de llamar a POST /api/v1/tasks/[id]/tags.
export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const categories = await prisma.tagCategory.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(categories);
}

// Crea una etiqueta en un proyecto: { categoryId, projectId, name }. PM del proyecto o administrador
// (misma regla que Configuración → Etiquetas). Devuelve { tag: { id, name } }.
const createSchema = z.object({ categoryId: z.string().min(1), projectId: z.string().min(1), name: z.string() });
export async function POST(request: Request) {
  return withBody(request, createSchema, (actor, data) => runAction(() => createTag(data.categoryId, data.projectId, data.name, actor)), 201);
}
