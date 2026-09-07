import { NextResponse } from "next/server";

// Punto 18/19: API key simple para uso interno (esta app + el skill de
// Claude) — no hace falta OAuth completo para un solo consumidor de confianza.
export function requireApiKey(request: Request) {
  const auth = request.headers.get("authorization");
  const key = auth?.replace(/^Bearer /, "");
  if (key !== process.env.API_KEY) {
    return NextResponse.json({ error: "API key inválida" }, { status: 401 });
  }
  return null;
}

// Evita que un body no-JSON (o vacío) tire un 500 crudo en vez de un 400 limpio.
export async function safeJson(request: Request): Promise<{ data: unknown } | { error: NextResponse }> {
  try {
    return { data: await request.json() };
  } catch {
    return { error: NextResponse.json({ error: "Body inválido, se esperaba JSON" }, { status: 400 }) };
  }
}
