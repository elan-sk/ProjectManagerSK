// Los prototipos HTML nunca se sirven "sueltos" desde el origen de la app: el enlace directo devuelve
// esta página envoltorio, que los mete en un iframe con sandbox (srcdoc, origen opaco: sin sesión,
// cookies ni acceso a la app). Así el aislamiento no depende de cabeceras que el servidor pueda pisar.
// Límite: sin "allow-same-origin", el prototipo no puede usar localStorage/cookies propios.
export const HTML_SANDBOX = "allow-scripts allow-forms allow-popups allow-modals";

const escapeAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
const escapeText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

export function htmlShell(title: string, source: string) {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeText(title)}</title>
<style>html,body{margin:0;height:100%;background:#fff}iframe{display:block;border:0;width:100%;height:100%}</style></head>
<body><iframe sandbox="${HTML_SANDBOX}" srcdoc="${escapeAttr(source)}" title="${escapeAttr(title)}"></iframe></body></html>`;
}
