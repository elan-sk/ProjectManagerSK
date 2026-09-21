import { NextResponse } from "next/server";
import { requireAnyUser } from "@/lib/apiAuth";
import { listLogFiles, readLog, type LogLevel } from "@/lib/logger";

// Registro del servidor, solo para administradores (sesión o token de login).
//   GET /api/v1/logs?list=1                      → archivos disponibles
//   GET /api/v1/logs?date=2026-09-21&level=warn&scope=whatsapp&q=texto&lines=300
export async function GET(request: Request) {
  const auth = await requireAnyUser(request);
  if ("error" in auth) return auth.error;
  if (auth.actor.role !== "ADMIN") return NextResponse.json({ error: "Solo un administrador puede ver el registro del servidor." }, { status: 403 });

  const p = new URL(request.url).searchParams;
  if (p.get("list")) return NextResponse.json(listLogFiles());
  const level = p.get("level");
  return NextResponse.json(
    readLog({
      date: p.get("date") ?? undefined,
      lines: Number(p.get("lines")) || undefined,
      level: level === "info" || level === "warn" || level === "error" ? (level as LogLevel) : undefined,
      scope: p.get("scope") ?? undefined,
      q: p.get("q") ?? undefined,
    }),
  );
}
