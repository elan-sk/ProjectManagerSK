import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/apiAuth";
import { PUBLIC_USER_SELECT } from "@/lib/publicUser";

// Punto 3 (skill dev-project-definer): resolver pmId/assigneeIds por
// usuario antes de crear el proyecto/tareas — evita que la skill tenga que
// adivinar IDs.
export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const users = await prisma.user.findMany({ where: { active: true }, select: PUBLIC_USER_SELECT, orderBy: { name: "asc" } });
  return NextResponse.json(users);
}
