import { NextResponse } from "next/server";
import { loginWithPassword, safeJson } from "@/lib/apiAuth";

// Punto pedido por el usuario: nada de clave compartida en el skill — cada
// quien hace login acá con SU usuario/contraseña (las mismas de la app web)
// y recibe una sesión de 8hs para usar en el resto de /api/v1/*. El skill no
// debe guardar ni el password ni el token en ningún archivo — solo tenerlos
// en memoria mientras dura esa corrida.
export async function POST(request: Request) {
  const parsedBody = await safeJson(request);
  if ("error" in parsedBody) return parsedBody.error;

  const body = parsedBody.data as { identifier?: unknown; password?: unknown };
  if (typeof body.identifier !== "string" || typeof body.password !== "string") {
    return NextResponse.json({ error: "Se esperaba { identifier, password }" }, { status: 400 });
  }

  const result = await loginWithPassword(body.identifier, body.password);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 401 });

  return NextResponse.json({ token: result.token, expiresAt: result.expiresAt, user: result.user });
}
