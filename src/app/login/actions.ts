"use server";

import { signIn } from "@/auth";
import { AuthError } from "next-auth";

export async function login(_prevState: string | undefined, formData: FormData) {
  try {
    await signIn("credentials", {
      identifier: formData.get("identifier"),
      password: formData.get("password"),
      redirectTo: "/agenda",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return "Correo/usuario o contraseña incorrectos.";
    }
    throw error;
  }
}
