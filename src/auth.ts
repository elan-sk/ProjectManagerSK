import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getUserStatus } from "@/lib/userStatus";
import { clearAttempts, isBlocked, LOGIN_MAX, LOGIN_WINDOW_MS, loginKey, recordAttempt } from "@/lib/rateLimit";

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        identifier: { label: "Correo o usuario", type: "text" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials) {
        const identifier = (credentials?.identifier as string | undefined)?.trim();
        const password = credentials?.password as string | undefined;
        if (!identifier || !password) return null;
        const key = loginKey(identifier);
        if (isBlocked(key, LOGIN_MAX, LOGIN_WINDOW_MS)) return null;

        // Entra con correo o con nombre de usuario, lo que haya escrito —
        // username es opcional (no todos lo tienen cargado), el correo
        // siempre sirve igual que antes.
        const user = await prisma.user.findFirst({
          where: { OR: [{ email: identifier }, { username: identifier }] },
          omit: { passwordHash: false, email: false },
        });
        const valid = Boolean(user?.active) && (await bcrypt.compare(password, user!.passwordHash));
        if (!user || !valid) {
          recordAttempt(key, LOGIN_WINDOW_MS);
          return null;
        }
        clearAttempts(key);

        return { id: user.id, name: user.name, email: user.email, role: user.role };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role: string }).role;
        return token;
      }
      // Seguridad: la sesión (JWT) dura semanas, así que en cada uso se confirma contra la base
      // que la cuenta siga activa y con qué rol. Desactivada o borrada → la sesión deja de valer.
      const status = typeof token.id === "string" ? await getUserStatus(token.id) : null;
      if (!status?.active) return null;
      token.role = status.role;
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
      }
      return session;
    },
  },
});
