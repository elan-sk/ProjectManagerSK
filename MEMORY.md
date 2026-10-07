# Memoria del proyecto

- **HTML para subir a PMSK (2026-10-07):** todo `.html` que se suba pasa antes por `npx tsx scripts/incrustar-html.mts <entrada.html>`, que deja imágenes, CSS y JS locales dentro del archivo. Al subirlo solo viaja el `.html` (renombrado), así que las rutas relativas quedarían rotas en la app y en el link compartido.
