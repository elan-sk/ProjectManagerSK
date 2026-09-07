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
