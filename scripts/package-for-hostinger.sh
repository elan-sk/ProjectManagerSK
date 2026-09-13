#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# git archive ya excluye node_modules/.git/.next/.env/etc. porque lee
# exactamente lo que .gitignore excluye del repo — ningún exclude-list propio
# que mantener aparte. Exige árbol limpio para que el zip sea exactamente lo
# que se va a subir (nunca un estado a medio commitear).
if [ -n "$(git status --porcelain)" ]; then
  echo "Hay cambios sin commitear. Commiteá (o descartá) antes de empaquetar, para que el zip coincida con lo que vas a subir." >&2
  git status --short >&2
  exit 1
fi

OUT="projectmanagersk-deploy.zip"
rm -f "$OUT"
git archive --format=zip -o "$OUT" HEAD

echo "Listo: $OUT ($(du -h "$OUT" | cut -f1))"
echo "En Hostinger (por SSH, dentro de la carpeta del sitio):"
echo "  1. Extraer el zip (reemplaza el código, no toca node_modules/.env que ya estén ahí)."
echo "  2. npm install"
echo "  3. npx prisma migrate deploy"
echo "  4. npm run build && npm run start (o reiniciar la app Node desde hPanel)"
