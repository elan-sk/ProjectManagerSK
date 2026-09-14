---
name: deploy-hostinger
description: Empaquetar y desplegar ProjectManagerSK al sitio real en Hostinger (hPanel, hosting de Node.js administrado). Usar cuando el usuario pida "desplegá a Hostinger", "armá el paquete", "subí esto a producción", o el sitio se caiga después de un deploy.
---

# Deploy a Hostinger — ProjectManagerSK

Todo lo de acá está **confirmado en vivo** contra el sitio real (`mediumorchid-donkey-632879.hostingersite.com`) el 2026-09-13, después de una caída real de producción — no es una suposición del README original (que decía "es por Git", cosa que resultó falsa para este sitio).

## Cómo es el deploy acá (nada de lo demás aplica)

- El sitio está en modo **"Subido manualmente"** en hPanel (no Git). El deploy es: hPanel → Sitios web → el sitio → **Despliegues** → subir un `.zip` → botón Deploy.
- Hostinger corre **únicamente** `npm install` + `npm run build` sobre ese zip. Nada más. No hay paso de SSH, no hay consola, no hay hook post-deploy.
- El SSH que da hPanel para este sitio es un **entorno completamente aparte** del que corre la app desplegada — ni siquiera tiene `node`/`npm` en el PATH. No sirve para nada relacionado al deploy en sí (ni para correr migraciones, ni para reiniciar el proceso a mano). Solo sirve para mirar `~/domains/<sitio>/hbuilds/` (ver abajo).
- En `~/domains/<sitio>/`: `public_html/` es solo un stub (`.htaccess` de proxy) — **nunca** poner código ahí (hay un archivo `DO_NOT_UPLOAD_HERE` de aviso). El código real vive en `hbuilds/versions/<uuid>/`, con `hbuilds/current` como symlink a la versión activa y `hbuilds/logs/<uuid>/` con el log de build de cada deploy (útil para diagnosticar sin adivinar).

## Pasos para desplegar

1. Commitear todo (`npm run package:hostinger` exige árbol limpio).
2. `git push origin master` (buena práctica, aunque este deploy puntual no lea de GitHub directamente).
3. `npm run package:hostinger` — genera `projectmanagersk-deploy.zip` en la raíz con `git archive` (respeta `.gitattributes`/`.gitignore`, sin exclude-list manual).
4. hPanel → Despliegues → subir ese zip → Deploy. Esperar que pase de "Compilando" a "Se ha completado".
5. Probar el sitio real.

## Las trampas que ya causaron un problema real

1. **Las migraciones de Prisma tienen que ir DENTRO de `npm run build`** (`package.json`: `"build": "prisma migrate deploy && next build"`). Como Hostinger no corre nada más, si sacás la migración de ahí y la dejás como paso "aparte", nunca se va a ejecutar en producción.
2. **Ninguna tarea de fondo puede usar `void promesa()` a secas** en `src/lib/scheduler.ts` ni `src/instrumentation.ts` — siempre `.catch(err => console.error(...))`. Un rechazo de promesa sin atajar en Node **tumba todo el proceso**, no solo esa función — así se cayó el sitio entero (no solo una página) cuando una migración quedó pendiente y el poller de WhatsApp intentó leer una columna que no existía.
3. **La base de producción no tiene el historial de migraciones de las primeras tablas** (se crearon a mano/por SQL suelto en algún momento, no vía `prisma migrate dev`/`deploy`). La PRIMERA vez que `prisma migrate deploy` corrió de verdad (al arreglar la trampa 1), tiró `Error: P3005 — The database schema is not empty` y **falló el build entero** — no es un problema del zip ni del código, es que Prisma no confía en aplicar migraciones sobre una base que no reconoce.
   - **Ya se resolvió una vez** (bautizado/"baseline" de `20260913053310_init_mysql` y `20260913084341_archive_project_deactivate_user` — ver commit `ee06cf1` y su revert en el siguiente commit). No hace falta repetirlo: la base de producción ya tiene el historial completo desde ahí.
   - **Si vuelve a pasar** (ej. en otra base/entorno nuevo, o si alguien corre `prisma db push` a mano de nuevo en vez de migraciones): el arreglo es marcar como aplicadas las migraciones que ya están reflejadas en las tablas existentes, SIN tocar datos —
     ```bash
     npx prisma migrate resolve --applied <nombre_de_la_migración>
     ```
     Esto solo escribe una fila en la tabla interna `_prisma_migrations` (que Prisma usa para saber qué migró y cuándo) — no ejecuta el SQL de esa migración, no toca ninguna tabla ni fila de datos reales. Como no hay SSH con acceso al entorno de la app (ver arriba), la única forma de correrlo es meterlo TEMPORALMENTE en el script de `build` (antes de `prisma migrate deploy`), desplegar UNA vez, y apenas confirme que anduvo, **revertir ese cambio de inmediato** — `migrate resolve --applied` tira `Error: P3008` si se corre de nuevo sobre una migración ya marcada, así que dejarlo puesto rompe el build de cualquier deploy futuro.

4. **Los archivos subidos (íconos de proyecto, adjuntos, avatares — `public/uploads/`, ver `src/lib/uploadFile.ts`) se pierden en CADA deploy nuevo** si `PERSISTENT_UPLOADS_DIR` no está configurada. Cada deploy activa una carpeta de versión nueva (`hbuilds/versions/<uuid>/`) sin heredar nada de la anterior, y `public/uploads/` está (correctamente) excluido del zip — así que cualquier archivo subido antes de un deploy queda huérfano en la versión vieja, invisible después. Síntoma real (2026-09-14): un ícono de proyecto se veía como el `alt` roto de la imagen, y un `.docx` adjunto tiraba "No se pudo mostrar este archivo" en el visor — ninguno de los dos es un bug de esos componentes, el archivo físico ya no existía.
   - **Arreglo (ya implementado, `src/lib/persistentUploads.ts` + `instrumentation.ts`)**: al arrancar, si `PERSISTENT_UPLOADS_DIR` (env var) está seteada, `public/uploads/` se convierte en symlink hacia esa carpeta — fuera del árbol de versiones, así que sobrevive a cualquier deploy futuro. Sin esa env var no hace nada (dev local queda igual que siempre).
   - **Setup en el servidor (una sola vez, por SSH — el mismo SSH de solo-lectura de archivos que ya se usa para ver logs, ver arriba)**:
     ```bash
     mkdir -p ~/domains/<sitio>/persistent-uploads
     pwd  # confirmá la ruta ABSOLUTA real (depende del usuario del sistema, algo como /home/u123456789/domains/...) — Node no expande "~"
     ```
   - **Setup en hPanel**: Sitios web → el sitio → variables de entorno de la app Node.js → agregar `PERSISTENT_UPLOADS_DIR` con esa ruta absoluta. Aplica desde el próximo restart/deploy.
   - **Los archivos que ya se perdieron antes de este fix no se recuperan solos** — hay que volver a subirlos a mano una vez que el symlink esté activo.

## Si el sitio se cae después de un deploy

No asumas que es el zip. Primero mirá, por SSH, el log de la última versión (no requiere que node/npm estén en el PATH, `cat` sí funciona):

```bash
cd ~/domains/<sitio>
ls -la hbuilds/versions/          # la última carpeta = la activa (current apunta ahí)
cat hbuilds/logs/<uuid-mas-reciente>/*
```

Si el log de build tiene un error (ej. `Error: P3005`, `P3008`, o cualquier error de `prisma migrate`/`next build`), **el deploy queda marcado "Falló la compilación"** en hPanel y ni siquiera llega a activarse — el sitio sigue sirviendo la última versión que sí compiló (que puede estar rota igual, ver trampa 2). Leé el error tal cual lo imprime el log, no asumas que es el contenido del zip.

Si el log de build NO tiene errores pero el sitio igual no responde ("This page couldn't load / A server error occurred" del navegador, no una página de error de la app), es un problema de **arranque/runtime** (promesa sin atajar tumbando el proceso — trampa 2), no del build en sí.
