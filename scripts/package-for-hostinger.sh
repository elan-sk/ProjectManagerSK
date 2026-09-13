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
echo "En hPanel → Sitios web → tu sitio → Despliegues: subí este zip y confirmá el deploy."
echo "Hostinger corre \"npm install\" + \"npm run build\" solo — no hay paso de SSH ni de"
echo "migración aparte, así que \"prisma migrate deploy\" ya va incluido en \"npm run build\"."
