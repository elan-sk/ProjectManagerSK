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

Requiere una base MySQL corriendo (local o remota) — mismo proveedor en dev y producción, ver "Stack" abajo. Si es la primera vez que se clona el repo:

```bash
cp .env.example .env       # completar los valores, ver abajo (incluida DATABASE_URL de tu MySQL)
npx prisma migrate deploy  # aplica el schema a esa base
npm run db:seed            # crea el usuario admin
```

## Variables de entorno (`.env`)

Ver `.env.example` para la lista completa y cómo generar cada una. Resumen:

| Variable | Para qué | Obligatoria |
|---|---|---|
| `DATABASE_URL` | MySQL — `mysql://usuario:contraseña@host:puerto/basededatos` | Sí |
| `AUTH_SECRET` | Firma de sesión (Auth.js) | Sí |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Notificaciones push (PWA) | Sí |
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
- **Prisma 7** (fijado, no el `8.0.0-rc` que resuelve `latest` — ver nota abajo) + MySQL (el incluido en el hosting de Hostinger) vía `@prisma/adapter-mariadb`, mismo proveedor en dev y producción
- **Auth.js v5** (Credentials + JWT, sin proveedores OAuth para login)
- **dnd-kit** para drag & drop (Kanban)
- **web-push** para notificaciones (VAPID)
- Festivos vía [Nager.Date](https://date.nager.at) (gratis, sin auth, cacheados en la tabla `Holiday`)

**Nota sobre versiones:** al momento de armar esto, `prisma@latest` resolvía a un `8.0.0-rc` con una CLI y paradigma completamente distintos (basado en "contratos", plataforma cloud propia). Se fijó `prisma`/`@prisma/client` en `7.10.0` a propósito — no correr `npm update` sobre estos paquetes sin revisar el CLI nuevo primero. Mismo cuidado con `next-auth@beta` (v5 sigue en beta).

## Estructura

- `src/app/(app)/` — todo lo que requiere sesión (layout hace el chequeo de `auth()`, Next 16 ya no usa `middleware.ts`/`proxy.ts` para esto).
- `src/app/api/v1/` — API pública (login por usuario/contraseña, sesión de 8hs), documentada en `.claude/skills/project-manager-sk/SKILL.md`.
- `src/lib/` — lógica de negocio pura (festivos/días hábiles, responsabilidad de atrasos, notificaciones, push, Google Calendar).
- `prisma/schema.prisma` — modelo de datos completo (proyectos, fases, tareas, dependencias, adjuntos, notificaciones).

## Subida de archivos

`public/uploads/` guarda insumos/evidencias localmente (whitelist de tipo: imágenes + PDF, máx 15MB — sin SVG por riesgo de XSS). **Sin confirmar todavía si esto sobrevive un redeploy** en el hosting de Node.js de Hostinger (el despliegue es vía Git — cada push puede rehacer el contenedor). Probar subiendo un archivo real, forzando un redeploy, y viendo si sigue estando — si no persiste, la alternativa (sin salir de la infraestructura ya elegida) es guardar el archivo como bytes en la misma base MySQL en vez de en disco.

## Despliegue en Hostinger (hosting de Node.js, hPanel)

**Confirmado en producción (2026-09-13):** este sitio está en modo "Subido manualmente" — el deploy es subir un zip en hPanel → tu sitio → **Despliegues**, no un push a Git. Hostinger corre **únicamente** `npm install` + `npm run build` sobre ese zip — no hay ningún paso de SSH, consola ni migración aparte disponible dentro de ese proceso (el SSH interactivo del hosting compartido ni siquiera tiene `node`/`npm` en el PATH: es un entorno distinto al que arma ese deploy administrado).

Por eso `prisma migrate deploy` va **incluido en el propio script de build** (`package.json`): es el único paso que Hostinger ejecuta, así que ahí es donde tiene que pasar. No lo saques de ahí sin agregar otra forma de correr migraciones en producción.

1. **Base de datos**: crear una base MySQL desde hPanel (Bases de datos → MySQL) y anotar host/usuario/contraseña/nombre de base.
2. **Variables de entorno**: en el panel del sitio → *Environment variables* — mismos nombres que `.env.example`, con `DATABASE_URL` apuntando a la base del paso 1 y `NEXTAUTH_URL` con el dominio real. Se inyectan tanto en el build como en la app corriendo.
3. **Armar el paquete**: `npm run package:hostinger` (exige árbol de git limpio — commiteá primero). Genera `projectmanagersk-deploy.zip` en la raíz (gitignorado), usando `git archive` — respeta `.gitattributes`/`.gitignore`, así que no hace falta mantener una lista de exclusión aparte.
4. **Subir el paquete**: hPanel → Sitios web → el sitio → **Despliegues** → subir `projectmanagersk-deploy.zip` → Deploy. Hostinger corre `npm install` y `npm run build` (que ya incluye la migración) y activa la nueva versión solo.
5. Primera vez únicamente, `npm run db:restore-users` (lee `scripts/production-users-seed.json`, no se commitea, hay que llevarlo aparte) para recrear los usuarios existentes con sus mismas contraseñas.
6. `WHATSAPP_ENABLED=true` en las variables de entorno si se quiere que conecte solo al arrancar; si no, conectar a mano una vez desde Configuración (va a pedir escanear el QR de nuevo — la sesión vieja no se migra).
7. Cada scheduler.ts/instrumentation.ts que arranca en el proceso ataja sus propios errores (`.catch()`, no `void` a secas) — un rechazo de promesa sin atajar tumba **todo el servidor Node**, no solo esa función, y así fue como se cayó el sitio la primera vez que una migración quedó pendiente.
