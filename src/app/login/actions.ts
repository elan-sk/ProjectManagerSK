"use server";

import { headers } from "next/headers";
import { signIn } from "@/auth";
import { AuthError } from "next-auth";
import { clientIp, isLoginBlocked, LOGIN_BLOCKED_MESSAGE } from "@/lib/rateLimit";

export async function login(_prevState: string | undefined, formData: FormData) {
  try {
    await signIn("credentials", {
      identifier: formData.get("identifier"),
      password: formData.get("password"),
      redirectTo: "/agenda",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      const identifier = String(formData.get("identifier") ?? "");
      if (isLoginBlocked(identifier, clientIp(await headers()))) return LOGIN_BLOCKED_MESSAGE;
      return "Correo/usuario o contraseña incorrectos.";
    }
    throw error;
  }
}
