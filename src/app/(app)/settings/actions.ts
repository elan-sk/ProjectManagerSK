"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    throw new Error("Solo un administrador puede hacer esto.");
  }
  return session.user;
}

const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(["ADMIN", "MEMBER"]),
  password: z.string().min(6, "Mínimo 6 caracteres"),
});

export async function createUser(formData: FormData) {
  try {
    await requireAdmin();
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  const parsed = createUserSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    role: formData.get("role"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) return { ok: false, error: "Ya existe un usuario con ese email." };

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await prisma.user.create({
    data: { name: parsed.data.name, email: parsed.data.email, role: parsed.data.role, passwordHash },
  });

  revalidatePath("/settings");
  return { ok: true };
}

export async function updateUserRole(userId: string, role: "ADMIN" | "MEMBER") {
  try {
    await requireAdmin();
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  await prisma.user.update({ where: { id: userId }, data: { role } });
  revalidatePath("/settings");
  return { ok: true };
}

const resetPasswordSchema = z.object({ password: z.string().min(6, "Mínimo 6 caracteres") });

export async function resetUserPassword(userId: string, formData: FormData) {
  try {
    await requireAdmin();
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  const parsed = resetPasswordSchema.safeParse({ password: formData.get("password") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  return { ok: true };
}

export async function updateUserProfile(userId: string, formData: FormData) {
  try {
    await requireAdmin();
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  const parsed = updateProfileSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing && existing.id !== userId) {
    return { ok: false, error: "Ya existe un usuario con ese email." };
  }

  await prisma.user.update({
    where: { id: userId },
    data: { name: parsed.data.name, email: parsed.data.email },
  });
  revalidatePath("/settings");
  return { ok: true };
}

export async function updateUserAvatar(userId: string, avatarUrl: string) {
  try {
    await requireAdmin();
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  await prisma.user.update({ where: { id: userId }, data: { avatarUrl } });
  revalidatePath("/settings");
  return { ok: true };
}

const updateProfileSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
});

export async function updateProfile(formData: FormData) {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "No autenticado." };

  const parsed = updateProfileSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing && existing.id !== session.user.id) {
    return { ok: false, error: "Ya existe un usuario con ese email." };
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { name: parsed.data.name, email: parsed.data.email },
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function updateAvatar(avatarUrl: string) {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "No autenticado." };

  await prisma.user.update({ where: { id: session.user.id }, data: { avatarUrl } });
  revalidatePath("/", "layout");
  return { ok: true };
}

const changeOwnPasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6, "Mínimo 6 caracteres"),
});

export async function changeOwnPassword(formData: FormData) {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "No autenticado." };

  const parsed = changeOwnPasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });
  const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!valid) return { ok: false, error: "La contraseña actual no es correcta." };

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  return { ok: true };
}
