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

## Las dos trampas que ya causaron una caída real

1. **Las migraciones de Prisma tienen que ir DENTRO de `npm run build`** (`package.json`: `"build": "prisma migrate deploy && next build"`). Como Hostinger no corre nada más, si sacás la migración de ahí y la dejás como paso "aparte", nunca se va a ejecutar en producción.
2. **Ninguna tarea de fondo puede usar `void promesa()` a secas** en `src/lib/scheduler.ts` ni `src/instrumentation.ts` — siempre `.catch(err => console.error(...))`. Un rechazo de promesa sin atajar en Node **tumba todo el proceso**, no solo esa función — así se cayó el sitio entero (no solo una página) cuando una migración quedó pendiente y el poller de WhatsApp intentó leer una columna que no existía.

## Si el sitio se cae después de un deploy

No asumas que es el zip. Primero mirá, por SSH, el log de la última versión (no requiere que node/npm estén en el PATH, `cat` sí funciona):

```bash
cd ~/domains/<sitio>
ls -la hbuilds/versions/          # la última carpeta = la activa (current apunta ahí)
cat hbuilds/logs/<uuid-mas-reciente>/*
```

Si el log de build no tiene errores, el problema es de **arranque/runtime** (falta variable de entorno, migración pendiente, promesa sin atajar — ver arriba), no del contenido del zip.
