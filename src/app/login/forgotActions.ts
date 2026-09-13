"use server";

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sendDirectAlert } from "@/lib/whatsapp";

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

// La gente no suele escribir el indicativo de país al anotar su número — si
// no lo trae, se lo completamos con el default de la app (hoy Colombia,
// "57", igual que el resto de la app — ver appSettings.ts) en vez de
// pedírselo.
function normalizePhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("57")) return digits;
  if (digits.length === 10) return `57${digits}`;
  return digits;
}

function hashToken(rawToken: string) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

// Paso 1: dado un correo/usuario, la pista (últimos 2 dígitos) del teléfono
// registrado — nada más, para poder mostrar "termina en **45" sin revelar el
// número completo.
export async function getPasswordResetHint(identifier: string) {
  const trimmed = identifier.trim();
  if (!trimmed) return { ok: false as const, error: "Escribí tu correo o usuario." };

  const user = await prisma.user.findFirst({ where: { OR: [{ email: trimmed }, { username: trimmed }] } });
  if (!user?.phone) {
    return { ok: false as const, error: "No encontramos una cuenta con teléfono registrado para ese correo/usuario — pedile a un administrador que te ayude." };
  }
  return { ok: true as const, hint: user.phone.slice(-2) };
}

// Paso 2: si el correo/usuario y el teléfono completo coinciden con una
// cuenta, genera un link de un solo uso (30 min) y lo manda por WhatsApp.
// Devuelve siempre el mismo mensaje genérico — ni confirma ni descarta si
// los datos eran correctos, para no filtrar el teléfono real de nadie.
export async function requestPasswordReset(identifier: string, phone: string) {
  const genericResult = {
    ok: true as const,
    message: "Si los datos coinciden con una cuenta, en un momento te llega un mensaje de WhatsApp con el link.",
  };
  const trimmedId = identifier.trim();
  const normalizedPhone = normalizePhone(phone);
  if (!trimmedId || !normalizedPhone) return genericResult;

  const user = await prisma.user.findFirst({ where: { OR: [{ email: trimmedId }, { username: trimmedId }] } });
  if (!user?.phone || user.phone !== normalizedPhone) return genericResult;

  const rawToken = crypto.randomBytes(32).toString("hex");
  await prisma.user.update({
    where: { id: user.id },
    data: { resetTokenHash: hashToken(rawToken), resetTokenExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
  });

  const base = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const link = `${base}/login/recuperar/${rawToken}`;
  await sendDirectAlert(
    user.phone,
    `Recuperación de contraseña — ProjectManagerSK\nUsá este link para elegir una nueva contraseña (válido 30 minutos):\n${link}\n\nSi no fuiste vos, ignorá este mensaje.`
  );

  return genericResult;
}

export async function validateResetToken(rawToken: string) {
  const user = await prisma.user.findUnique({ where: { resetTokenHash: hashToken(rawToken) } });
  return Boolean(user?.resetTokenExpiresAt && user.resetTokenExpiresAt > new Date());
}

const newPasswordSchema = z.object({
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres."),
});

// Un solo uso: valida el token, guarda el hash nuevo, y limpia el token para
// que no se pueda reusar ni aunque no haya vencido todavía.
export async function resetPasswordWithToken(rawToken: string, formData: FormData) {
  const parsed = newPasswordSchema.safeParse({ password: formData.get("password") });
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const user = await prisma.user.findUnique({ where: { resetTokenHash: hashToken(rawToken) } });
  if (!user?.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date()) {
    return { ok: false as const, error: "Este link venció o ya se usó — pedí uno nuevo." };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, resetTokenHash: null, resetTokenExpiresAt: null },
  });
  return { ok: true as const };
}
