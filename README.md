# ProjectManagerSK

Sistema de gestión de proyectos interno (vos + tu equipo): tablero Kanban con drag & drop, vista Gantt, checklist/adjuntos por tarea, festivos automáticos, responsabilidad de atrasos, rendimiento del equipo, alarmas in-app + push, API pública y skill de Claude.

Definido a partir del manuscrito y los Excels en `Documentacion/Insumos/` — ver `.claude/skills/dev-project-definer` para el proceso de definición si hace falta retomarlo.

## Arrancar en local

```bash
npm install
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000) — redirige a `/login`.

**Usuario de prueba:** `ecovia2@gmail.com` / `cambiar-esta-clave` (creado por `prisma/seed.ts`; cambiala tras el primer login — hoy no hay pantalla de "cambiar contraseña", se actualiza directo en la tabla `User` o agregando esa pantalla).

Si es la primera vez que se clona el repo:

```bash
cp .env.example .env      # completar los valores, ver abajo
npx prisma migrate dev    # crea dev.db y aplica el schema
npm run db:seed           # crea el usuario admin
```

## Variables de entorno (`.env`)

Ver `.env.example` para la lista completa y cómo generar cada una. Resumen:

| Variable | Para qué | Obligatoria |
|---|---|---|
| `DATABASE_URL` | SQLite en dev (`file:./dev.db`); Postgres/Supabase en producción | Sí |
| `AUTH_SECRET` | Firma de sesión (Auth.js) | Sí |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Notificaciones push (PWA) | Sí |
| `API_KEY` | Autenticación de `/api/v1/*` (API pública + skill de Claude) | Sí |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Sincronizar tareas a Google Calendar | **Pendiente** — ver abajo |

## Pendiente: Google Calendar

El código ya está listo (`src/lib/googleCalendar.ts`, rutas `/api/google-calendar/connect` y `/callback`, botón "Agregar a Google Calendar" en el detalle de tarea) pero falta configurar credenciales OAuth propias:

1. En [Google Cloud Console](https://console.cloud.google.com/) → crear/seleccionar un proyecto → habilitar la **Google Calendar API**.
2. **APIs & Services → Credentials → Create Credentials → OAuth client ID**, tipo "Web application".
3. Authorized redirect URI: `http://localhost:3000/api/google-calendar/callback` (o el dominio real en producción).
4. Pegar `Client ID` y `Client Secret` en `.env` (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`) y reiniciar el servidor.
5. Ir a `/settings` dentro de la app y conectar la cuenta.

Sin esto, el sistema funciona igual — las alarmas ya llegan in-app y por Web Push.

## Stack

- **Next.js 16** (App Router) + TypeScript + Tailwind v4
- **Prisma 7** (fijado, no el `8.0.0-rc` que resuelve `latest` — ver nota abajo) + SQLite en dev / Postgres en producción vía `@prisma/adapter-*`
- **Auth.js v5** (Credentials + JWT, sin proveedores OAuth para login)
- **dnd-kit** para drag & drop (Kanban)
- **web-push** para notificaciones (VAPID)
- Festivos vía [Nager.Date](https://date.nager.at) (gratis, sin auth, cacheados en la tabla `Holiday`)

**Nota sobre versiones:** al momento de armar esto, `prisma@latest` resolvía a un `8.0.0-rc` con una CLI y paradigma completamente distintos (basado en "contratos", plataforma cloud propia). Se fijó `prisma`/`@prisma/client` en `7.10.0` a propósito — no correr `npm update` sobre estos paquetes sin revisar el CLI nuevo primero. Mismo cuidado con `next-auth@beta` (v5 sigue en beta).

## Estructura

- `src/app/(app)/` — todo lo que requiere sesión (layout hace el chequeo de `auth()`, Next 16 ya no usa `middleware.ts`/`proxy.ts` para esto).
- `src/app/api/v1/` — API pública (protegida por `API_KEY`), documentada en `.claude/skills/project-manager-sk/SKILL.md`.
- `src/lib/` — lógica de negocio pura (festivos/días hábiles, responsabilidad de atrasos, notificaciones, push, Google Calendar).
- `prisma/schema.prisma` — modelo de datos completo (proyectos, fases, tareas, dependencias, adjuntos, notificaciones).

## Subida de archivos

`public/uploads/` guarda insumos/evidencias localmente (whitelist de tipo: imágenes + PDF, máx 15MB — sin SVG por riesgo de XSS). Para producción en Hostinger, cambiar `src/app/api/upload/route.ts` por un `put()` a Supabase Storage; el resto del flujo (`Attachment.fileUrl`) no cambia.
