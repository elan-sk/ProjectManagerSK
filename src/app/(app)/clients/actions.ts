"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canSeeClient, clientPickerWhere, deleteClient, saveClient, type ClientInput } from "@/lib/clients";
import { managedProjectWhere } from "@/lib/permissions";

const NOT_ADMIN = "Solo un administrador puede cambiar la ficha de un cliente.";

export async function listClientOptions(): Promise<{ id: string; label: string }[]> {
  const session = await auth();
  if (!session?.user) return [];
  const clients = await prisma.client.findMany({ where: clientPickerWhere(session.user), orderBy: { name: "asc" }, select: { id: true, name: true } });
  return clients.map((c) => ({ id: c.id, label: c.name }));
}

export async function getClientCard(id: string) {
  const session = await auth();
  if (!session?.user || !(await canSeeClient(session.user, id))) return null;
  const isAdmin = session.user.role === "ADMIN";
  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      projects: {
        where: { status: { not: "ARCHIVED" }, ...(isAdmin ? {} : managedProjectWhere(session.user.id)) },
        select: { id: true, name: true, iconUrl: true, archivedAt: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  return client ? { client, canEdit: isAdmin } : null;
}

export type ClientCard = NonNullable<Awaited<ReturnType<typeof getClientCard>>>["client"];

export async function saveClientAction(id: string | null, input: ClientInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") return { ok: false, error: NOT_ADMIN };
  try {
    const result = await saveClient(id, input, session.user.id);
    if (!result.ok) return result;
    revalidatePath("/company");
    revalidatePath(`/clients/${result.id}`);
    revalidatePath("/projects", "layout");
    return { ok: true, id: result.id };
  } catch (err) {
    console.error("[clientes] no se pudo guardar", err);
    return { ok: false, error: "No se pudo guardar. Intentarlo de nuevo en un momento." };
  }
}

export async function deleteClientAction(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") return { ok: false, error: NOT_ADMIN };
  try {
    await deleteClient(id);
    revalidatePath("/company");
    return { ok: true };
  } catch (err) {
    console.error("[clientes] no se pudo eliminar", err);
    return { ok: false, error: "No se pudo eliminar. Intentarlo de nuevo en un momento." };
  }
}
