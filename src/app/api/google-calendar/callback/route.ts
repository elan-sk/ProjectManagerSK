import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { exchangeCodeForTokens } from "@/lib/googleCalendar";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.redirect(new URL("/login", process.env.NEXTAUTH_URL));

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get("google_oauth_state")?.value;
  cookieStore.delete("google_oauth_state");

  if (!code || !state || state !== expectedState) {
    return NextResponse.redirect(
      new URL("/settings?google_calendar=error", process.env.NEXTAUTH_URL)
    );
  }

  const tokens = await exchangeCodeForTokens(code);
  const expiryDate = new Date(Date.now() + tokens.expires_in * 1000);

  await prisma.googleCalendarConnection.upsert({
    where: { userId: session.user.id },
    update: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiryDate,
    },
    create: {
      userId: session.user.id,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiryDate,
    },
  });

  return NextResponse.redirect(
    new URL("/settings?google_calendar=connected", process.env.NEXTAUTH_URL)
  );
}
