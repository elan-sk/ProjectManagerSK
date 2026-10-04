"use server";

import { signIn } from "@/auth";
import { AuthError } from "next-auth";
import { isBlocked, LOGIN_BLOCKED_MESSAGE, LOGIN_MAX, LOGIN_WINDOW_MS, loginKey } from "@/lib/rateLimit";

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
      if (isBlocked(loginKey(identifier), LOGIN_MAX, LOGIN_WINDOW_MS)) return LOGIN_BLOCKED_MESSAGE;
      return "Correo/usuario o contraseña incorrectos.";
    }
    throw error;
  }
}
