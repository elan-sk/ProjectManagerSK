import { prisma } from "@/lib/prisma";

// ponytail: flujo OAuth manual (no via NextAuth) porque esto NO es un
// método de login — es una conexión adicional para poder crear eventos en
// el Calendar del usuario ya logueado. Requiere GOOGLE_CLIENT_ID/SECRET en
// .env (ver README) — hasta entonces estas funciones no se pueden ejercitar.
const SCOPE = "https://www.googleapis.com/auth/calendar.events";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

function redirectUri() {
  return `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/api/google-calendar/callback`;
}

export function getGoogleAuthUrl(state: string) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeCodeForTokens(code: string) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`No se pudo intercambiar el código de Google: ${res.status}`);
  return (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
}

async function refreshAccessToken(refreshToken: string) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`No se pudo refrescar el token de Google: ${res.status}`);
  return (await res.json()) as { access_token: string; expires_in: number };
}

export async function getValidAccessToken(userId: string) {
  const conn = await prisma.googleCalendarConnection.findUnique({ where: { userId } });
  if (!conn) return null;

  if (conn.expiryDate > new Date(Date.now() + 60_000)) return conn.accessToken;

  const refreshed = await refreshAccessToken(conn.refreshToken);
  const expiryDate = new Date(Date.now() + refreshed.expires_in * 1000);
  await prisma.googleCalendarConnection.update({
    where: { userId },
    data: { accessToken: refreshed.access_token, expiryDate },
  });
  return refreshed.access_token;
}

export async function createCalendarEvent(
  userId: string,
  event: { summary: string; description?: string; start: Date; end: Date }
) {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) throw new Error("El usuario no conectó Google Calendar todavía");

  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: event.summary,
        description: event.description,
        start: { date: event.start.toISOString().slice(0, 10) },
        end: { date: event.end.toISOString().slice(0, 10) },
      }),
    }
  );
  if (!res.ok) throw new Error(`Google Calendar rechazó el evento: ${res.status}`);
  return res.json();
}
