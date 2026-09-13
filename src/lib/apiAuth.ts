import crypto from "node:crypto";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { Actor } from "@/lib/permissions";

// La API pública (skills, ej. project-manager-sk) NO usa una clave
// compartida: cada quien hace login con SU usuario/contraseña (mismas
// credenciales que la app web) y recibe una sesión de corta duración. Así
// el skill se puede compartir con todo el equipo sin que quede ninguna
// credencial grabada en su config — cada persona actúa con su propio rol
// (ver permissions.ts: Actor).
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 horas — alcanza y sobra para una corrida del skill.

function hashToken(rawToken: string) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

// POST /api/v1/auth/login — ver esa ruta.
export async function loginWithPassword(identifier: string, password: string) {
  const trimmed = identifier.trim();
  if (!trimmed || !password) return { ok: false as const, error: "Faltan usuario/correo o contraseña." };

  const user = await prisma.user.findFirst({ where: { OR: [{ email: trimmed }, { username: trimmed }] } });
  if (!user) return { ok: false as const, error: "Credenciales inválidas." };

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return { ok: false as const, error: "Credenciales inválidas." };

  const rawToken = crypto.randomBytes(32).toString("hex");
  await prisma.user.update({
    where: { id: user.id },
    data: { apiSessionTokenHash: hashToken(rawToken), apiSessionExpiresAt: new Date(Date.now() + SESSION_TTL_MS) },
  });

  return {
    ok: true as const,
    token: rawToken,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    user: { id: user.id, name: user.name, username: user.username, role: user.role },
  };
}

// Resuelve el actor real a partir del `Authorization: Bearer <token de
// login>` — reemplaza a la vieja API key compartida. Cada endpoint aplica
// después el mismo permiso que ya exige su equivalente en la app web
// (canEditTask/canReviewTask/getProjectAdmin, todas aceptan este actor).
export async function requireApiUser(request: Request): Promise<{ error: NextResponse } | { actor: Actor }> {
  const auth = request.headers.get("authorization");
  const rawToken = auth?.replace(/^Bearer /, "");
  if (!rawToken) {
    return { error: NextResponse.json({ error: "Falta el token — hacé login primero en POST /api/v1/auth/login" }, { status: 401 }) };
  }

  const user = await prisma.user.findUnique({ where: { apiSessionTokenHash: hashToken(rawToken) } });
  if (!user || !user.apiSessionExpiresAt || user.apiSessionExpiresAt < new Date()) {
    return { error: NextResponse.json({ error: "Sesión inválida o vencida — hacé login de nuevo." }, { status: 401 }) };
  }

  return { actor: { id: user.id, role: user.role } };
}

// Igual que requireApiUser, pero también acepta la sesión normal del
// navegador (cookie de Auth.js) — usado por rutas como /api/upload que
// sirven tanto a la app web (siempre con cookie) como a la skill (con
// token de login). Probá el token primero: si viene el header
// Authorization, tiene que ser válido — no cae en silencio a la cookie.
export async function requireAnyUser(request: Request): Promise<{ error: NextResponse } | { actor: Actor }> {
  if (request.headers.get("authorization")) {
    return requireApiUser(request);
  }
  const session = await auth();
  if (!session?.user) {
    return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  }
  return { actor: { id: session.user.id, role: session.user.role } };
}

// Evita que un body no-JSON (o vacío) tire un 500 crudo en vez de un 400 limpio.
export async function safeJson(request: Request): Promise<{ data: unknown } | { error: NextResponse }> {
  try {
    return { data: await request.json() };
  } catch {
    return { error: NextResponse.json({ error: "Body inválido, se esperaba JSON" }, { status: 400 }) };
  }
}
