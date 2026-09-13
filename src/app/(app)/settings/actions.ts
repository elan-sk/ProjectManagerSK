"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { setAppCountryCode } from "@/lib/appSettings";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    throw new Error("Solo un administrador puede hacer esto.");
  }
  return session.user;
}

// Identificador principal para entrar — obligatorio. Solo
// minúsculas/números/./_/- para que sea fácil de escribir sin errores.
const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,30}$/, "El usuario solo puede tener minúsculas, números, puntos, guiones y guion bajo (3 a 30 caracteres)");

// Opcional a partir de ahora (username es el principal) — si se carga, tiene
// que ser un email válido.
const emailSchema = z.string().trim().email().optional().or(z.literal(""));

async function assertUsernameAvailable(username: string, excludeUserId?: string) {
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing && existing.id !== excludeUserId) return "Ya existe un usuario con ese nombre de usuario.";
  return null;
}

async function assertEmailAvailable(email: string | undefined, excludeUserId?: string) {
  if (!email) return null;
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.id !== excludeUserId) return "Ya existe un usuario con ese email.";
  return null;
}

const createUserSchema = z.object({
  name: z.string().min(1),
  username: usernameSchema,
  email: emailSchema,
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
    username: formData.get("username"),
    email: formData.get("email"),
    role: formData.get("role"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const usernameError = await assertUsernameAvailable(parsed.data.username);
  if (usernameError) return { ok: false, error: usernameError };
  const emailError = await assertEmailAvailable(parsed.data.email || undefined);
  if (emailError) return { ok: false, error: emailError };

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await prisma.user.create({
    data: {
      name: parsed.data.name,
      username: parsed.data.username,
      email: parsed.data.email || null,
      role: parsed.data.role,
      passwordHash,
    },
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
    username: formData.get("username"),
    email: formData.get("email"),
    phone: formData.get("phone"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const usernameError = await assertUsernameAvailable(parsed.data.username, userId);
  if (usernameError) return { ok: false, error: usernameError };
  const emailError = await assertEmailAvailable(parsed.data.email || undefined, userId);
  if (emailError) return { ok: false, error: emailError };

  await prisma.user.update({
    where: { id: userId },
    data: { name: parsed.data.name, username: parsed.data.username, email: parsed.data.email || null, phone: parsed.data.phone || null },
  });
  revalidatePath("/settings");
  return { ok: true };
}

export async function updateAppCountry(countryCode: string) {
  try {
    await requireAdmin();
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  const parsed = z.string().trim().length(2).safeParse(countryCode);
  if (!parsed.success) return { ok: false, error: "Código de país inválido." };

  await setAppCountryCode(parsed.data);
  revalidatePath("/", "layout");
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
  username: usernameSchema,
  email: emailSchema,
  phone: z
    .string()
    .regex(/^[0-9]{8,15}$/, "Solo números, con indicativo de país y sin espacios ni +")
    .optional()
    .or(z.literal("")),
});

export async function updateProfile(formData: FormData) {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "No autenticado." };

  const parsed = updateProfileSchema.safeParse({
    name: formData.get("name"),
    username: formData.get("username"),
    email: formData.get("email"),
    phone: formData.get("phone"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const usernameError = await assertUsernameAvailable(parsed.data.username, session.user.id);
  if (usernameError) return { ok: false, error: usernameError };
  const emailError = await assertEmailAvailable(parsed.data.email || undefined, session.user.id);
  if (emailError) return { ok: false, error: emailError };

  await prisma.user.update({
    where: { id: session.user.id },
    data: { name: parsed.data.name, username: parsed.data.username, email: parsed.data.email || null, phone: parsed.data.phone || null },
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
