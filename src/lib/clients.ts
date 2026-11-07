import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { normalizeSearchText } from "@/lib/search";

export const CLIENT_FIELDS = ["name", "logoUrl", "contactName", "contactEmail", "contactPhone", "website", "profile"] as const;
export type ClientInput = Partial<Record<(typeof CLIENT_FIELDS)[number], string | null>>;
type Viewer = { id: string; role: string };

export function clientKey(name: string): string {
  return normalizeSearchText(name).replace(/\s+/g, " ").trim();
}

export function clientVisibleWhere(viewer: Viewer): Prisma.ClientWhereInput {
  return viewer.role === "ADMIN" ? {} : { projects: { some: { pmId: viewer.id } } };
}

export async function canSeeClient(viewer: Viewer, clientId: string): Promise<boolean> {
  return (await prisma.client.count({ where: { id: clientId, ...clientVisibleWhere(viewer) } })) > 0;
}

export async function canCreateClients(viewer: Viewer): Promise<boolean> {
  return viewer.role === "ADMIN" || viewer.role === "COORDINATOR";
}

export function clientPickerWhere(viewer: Viewer): Prisma.ClientWhereInput {
  return viewer.role === "COORDINATOR" ? {} : clientVisibleWhere(viewer);
}

export async function findOrCreateClient(name: string, userId: string | null) {
  const clean = name.replace(/\s+/g, " ").trim();
  const key = clientKey(clean);
  if (!key) return null;
  return prisma.client.upsert({ where: { nameKey: key }, create: { name: clean, nameKey: key, createdById: userId }, update: {}, select: { id: true, name: true } });
}

export async function clientFieldsFor(input: { clientId?: string | null; clientName?: string | null }, userId: string | null) {
  if (input.clientId) {
    const client = await prisma.client.findUnique({ where: { id: input.clientId }, select: { id: true, name: true } });
    if (!client) throw new Error("Ese cliente ya no existe.");
    return { clientId: client.id, clientName: client.name };
  }
  if (input.clientName === undefined) return {};
  if (input.clientName && !(await prisma.client.findUnique({ where: { nameKey: clientKey(input.clientName.replace(/\s+/g, " ").trim()) }, select: { id: true } }))) {
    const user = userId ? await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } }) : null;
    if (!user || !(await canCreateClients(user))) throw new Error("Solo un administrador o un coordinador pueden crear clientes nuevos. Elegir uno de la lista.");
  }
  const client = input.clientName ? await findOrCreateClient(input.clientName, userId) : null;
  return { clientId: client?.id ?? null, clientName: client?.name ?? null };
}

export async function clientFieldsFromChoice(raw: FormDataEntryValue | null, userId: string | null) {
  if (typeof raw !== "string") return {};
  const value = raw.trim();
  if (!value) return { clientId: null, clientName: null };
  const byId = await prisma.client.findUnique({ where: { id: value }, select: { id: true, name: true } });
  if (byId) return { clientId: byId.id, clientName: byId.name };
  return clientFieldsFor({ clientName: value }, userId);
}

function cleanFields(input: ClientInput) {
  const data: Record<string, string | null> = {};
  for (const field of CLIENT_FIELDS) {
    const value = input[field];
    if (value === undefined) continue;
    const text = value?.trim() ?? "";
    data[field] = text || null;
  }
  return data;
}

export async function saveClient(id: string | null, input: ClientInput, userId: string | null): Promise<{ ok: true; id: string; name: string } | { ok: false; error: string }> {
  const data = cleanFields(input);
  if (data.contactEmail && !/^\S+@\S+\.\S+$/.test(data.contactEmail)) return { ok: false, error: "El correo de contacto no es válido." };
  if (data.profile && data.profile.length > 20000) return { ok: false, error: "El perfil es demasiado largo." };
  if (data.name === null || (!id && !data.name)) return { ok: false, error: "Falta indicar el nombre del cliente." };
  const key = data.name ? clientKey(data.name) : undefined;
  if (key) {
    const same = await prisma.client.findUnique({ where: { nameKey: key }, select: { id: true, name: true } });
    if (same && same.id !== id) return { ok: false, error: `Ya existe el cliente «${same.name}». Usar ese.` };
  }
  const values = { ...data, ...(key ? { nameKey: key } : {}) };
  const client = id
    ? await prisma.client.update({ where: { id }, data: values, select: { id: true, name: true } })
    : await prisma.client.create({ data: { ...values, name: data.name!, nameKey: key!, createdById: userId }, select: { id: true, name: true } });
  if (id && data.name) await prisma.project.updateMany({ where: { clientId: id }, data: { clientName: client.name } });
  return { ok: true, ...client };
}

export async function deleteClient(id: string) {
  await prisma.client.delete({ where: { id } });
}

export async function linkLegacyClients(): Promise<number> {
  const projects = await prisma.project.findMany({ where: { clientId: null, clientName: { not: null } }, select: { id: true, clientName: true } });
  let linked = 0;
  for (const p of projects) {
    const client = await findOrCreateClient(p.clientName!, null);
    if (!client) continue;
    await prisma.project.update({ where: { id: p.id }, data: { clientId: client.id } });
    linked++;
  }
  return linked;
}

type Result<T> = { ok: true } & T | { ok: false; status: number; error: string };

export async function listClientsFor(viewer: Viewer) {
  const clients = await prisma.client.findMany({
    where: clientVisibleWhere(viewer),
    orderBy: { name: "asc" },
    select: { id: true, name: true, profile: true, _count: { select: { projects: true } } },
  });
  return clients.map((c) => ({ id: c.id, name: c.name, hasProfile: Boolean(c.profile?.trim()), projects: c._count.projects }));
}

export async function clientDetailFor(viewer: Viewer, id: string): Promise<Result<{ client: unknown }>> {
  if (!(await canSeeClient(viewer, id))) return { ok: false, status: 404, error: "Ese cliente no existe o no está entre los de sus proyectos." };
  const client = await prisma.client.findUniqueOrThrow({
    where: { id },
    select: {
      id: true, name: true, logoUrl: true, contactName: true, contactEmail: true, contactPhone: true, website: true, profile: true,
      projects: { where: { status: { not: "ARCHIVED" }, ...(viewer.role === "ADMIN" ? {} : { pmId: viewer.id }) }, select: { id: true, name: true, archivedAt: true } },
    },
  });
  return { ok: true, client };
}

export async function saveClientAs(viewer: Viewer, id: string | null, input: ClientInput): Promise<Result<{ id: string; name: string }>> {
  if (id ? viewer.role !== "ADMIN" : !(await canCreateClients(viewer))) {
    return { ok: false, status: 403, error: id ? "Solo un administrador puede cambiar la ficha de un cliente." : "Solo un administrador o un PM pueden crear clientes." };
  }
  if (id && !(await prisma.client.count({ where: { id } }))) return { ok: false, status: 404, error: "Ese cliente ya no existe." };
  const result = await saveClient(id, input, viewer.id);
  return result.ok ? result : { ok: false, status: 400, error: result.error };
}

export async function deleteClientAs(viewer: Viewer, id: string): Promise<Result<object>> {
  if (viewer.role !== "ADMIN") return { ok: false, status: 403, error: "Solo un administrador puede eliminar clientes." };
  if (!(await prisma.client.count({ where: { id } }))) return { ok: false, status: 404, error: "Ese cliente ya no existe." };
  await deleteClient(id);
  return { ok: true };
}

export const clientBodySchema = z.object({
  name: z.string().trim().max(190).optional(),
  logoUrl: z.string().regex(/^\/uploads\/[A-Za-z0-9._-]+$/, "logoUrl debe ser la url que devolvió /api/upload.").nullable().optional(),
  contactName: z.string().max(190).nullable().optional(),
  contactEmail: z.string().max(190).nullable().optional(),
  contactPhone: z.string().max(190).nullable().optional(),
  website: z.string().max(190).nullable().optional(),
  profile: z.string().max(20000).nullable().optional(),
});
