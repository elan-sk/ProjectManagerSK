// Los prototipos HTML nunca se sirven "sueltos" desde el origen de la app: el enlace directo devuelve
// esta página envoltorio, que los mete en un iframe con sandbox (srcdoc). Así el aislamiento no depende
// de cabeceras que el servidor pueda pisar.
// "allow-same-origin" (decisión 2026-09-21, a pedido del usuario): con srcdoc, un iframe con este flag
// toma el origen del documento PADRE (acá, el propio origen de la app) — no un origen aparte. Es lo que
// permite que el HTML subido guarde su progreso en localStorage (checklists de instructivos), pero
// también le da a ese HTML acceso al localStorage de la app y le permite hacer pedidos a la API de
// PMSK con la sesión de quien lo esté mirando. Aceptado porque solo admin/PM pueden subir HTML y son
// quienes escriben ese contenido — un aislamiento real (sin este riesgo) exigiría servir estos archivos
// desde un subdominio aparte, no solo este sandbox.
export const HTML_SANDBOX = "allow-scripts allow-same-origin allow-forms allow-popups allow-modals";

const escapeAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
const escapeText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

export function htmlShell(title: string, source: string) {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeText(title)}</title>
<style>html,body{margin:0;height:100%;background:#fff}iframe{display:block;border:0;width:100%;height:100%}</style></head>
<body><iframe sandbox="${HTML_SANDBOX}" srcdoc="${escapeAttr(source)}" title="${escapeAttr(title)}"></iframe></body></html>`;
}
