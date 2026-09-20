import { NextResponse } from "next/server";
import type { z } from "zod";
import { requireApiUser, safeJson } from "@/lib/apiAuth";
import type { Actor } from "@/lib/permissions";

// Ayudante común de las rutas /api/v1: login (Bearer), JSON, validación con zod y
// traducción del resultado de un servicio a HTTP. Cada ruta queda en pocas líneas y
// nunca se salta el permiso: el usuario (Actor) viaja hasta la regla de cada acción.

export type ApiResult = { ok: true; [key: string]: unknown } | { ok: false; status?: number; error: string };

// Errores de las acciones de la app (sin código HTTP): permiso -> 403, no existe -> 404, el resto -> 409.
function statusFor(error: string) {
  if (/permiso|acceso|solo (el|un|quien)|iniciar sesi/i.test(error)) return 403;
  if (/no existe|ya no existe|no encontrad/i.test(error)) return 404;
  return 409;
}

export function respond(result: ApiResult, okStatus = 200) {
  if (result.ok) {
    const { ok, ...rest } = result;
    void ok;
    return NextResponse.json(rest, { status: okStatus });
  }
  return NextResponse.json({ error: result.error }, { status: result.status ?? statusFor(result.error) });
}

/** GET / DELETE: solo login. */
export async function withAuth(request: Request, fn: (actor: Actor) => Promise<ApiResult>, okStatus = 200) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;
  return respond(await fn(auth.actor), okStatus);
}

/** POST / PATCH con cuerpo JSON validado. */
export async function withBody<S extends z.ZodTypeAny>(
  request: Request,
  schema: S,
  fn: (actor: Actor, data: z.infer<S>) => Promise<ApiResult>,
  okStatus = 200
) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;
  const parsedBody = await safeJson(request);
  if ("error" in parsedBody) return parsedBody.error;
  const parsed = schema.safeParse(parsedBody.data);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "cuerpo"}: ${i.message}`);
    return NextResponse.json({ error: issues[0], details: issues }, { status: 400 });
  }
  return respond(await fn(auth.actor, parsed.data), okStatus);
}
