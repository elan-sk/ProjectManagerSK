import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/apiAuth";

// Categorías de etiqueta globales (color + emoji) — lo que hace falta para
// resolver `categoryId` antes de llamar a POST /api/v1/tasks/[id]/tags.
export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const categories = await prisma.tagCategory.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(categories);
}
