import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiKey } from "@/lib/apiAuth";
import { PUBLIC_USER_SELECT } from "@/lib/publicUser";

// Punto 3 (skill dev-project-definer): resolver pmId/assigneeIds por email
// antes de crear el proyecto/tareas — evita que la skill tenga que adivinar IDs.
export async function GET(request: Request) {
  const denied = requireApiKey(request);
  if (denied) return denied;

  const users = await prisma.user.findMany({ select: PUBLIC_USER_SELECT, orderBy: { name: "asc" } });
  return NextResponse.json(users);
}
