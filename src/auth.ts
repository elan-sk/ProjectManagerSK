import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getUserStatus } from "@/lib/userStatus";
import { clearAttempts, clientIp, isLoginBlocked, loginKey, recordLoginFailure } from "@/lib/rateLimit";
import { contextActor } from "@/lib/actorContext";

const nextAuth = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        identifier: { label: "Correo o usuario", type: "text" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials, request) {
        const identifier = (credentials?.identifier as string | undefined)?.trim();
        const password = credentials?.password as string | undefined;
        if (!identifier || !password) return null;
        const ip = clientIp(request.headers);
        if (isLoginBlocked(identifier, ip)) return null;

        // Entra con correo o con nombre de usuario, lo que haya escrito —
        // username es opcional (no todos lo tienen cargado), el correo
        // siempre sirve igual que antes.
        const user = await prisma.user.findFirst({
          where: { OR: [{ email: identifier }, { username: identifier }] },
          omit: { passwordHash: false, email: false },
        });
        const valid = Boolean(user?.active) && (await bcrypt.compare(password, user!.passwordHash));
        if (!user || !valid) {
          recordLoginFailure(identifier, ip);
          return null;
        }
        clearAttempts(loginKey(identifier));

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

export const { handlers, signIn, signOut } = nextAuth;

const baseAuth = nextAuth.auth;

export const auth = ((...args: unknown[]) => {
  const actor = contextActor();
  if (actor && args.length === 0) {
    return Promise.resolve({
      user: { id: actor.userId, role: actor.role, name: actor.name, email: "" },
      expires: new Date(Date.now() + 60_000).toISOString(),
    });
  }
  return (baseAuth as (...rest: unknown[]) => unknown)(...args);
}) as typeof baseAuth;
