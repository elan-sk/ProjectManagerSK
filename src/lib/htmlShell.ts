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

const escapeText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
// JSON seguro dentro de un <script>: "<" escapado para que un "</script>" del prototipo no cierre la etiqueta.
const jsonForScript = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");

// El "#" del enlace se aplica a ESTA página envoltorio, no al prototipo de adentro (que vive en un
// iframe con su propio location): sin esto siempre se abría el inicio, tanto con rutas tipo "#/pos"
// (prototipos que leen location.hash y escuchan hashchange) como con "#id" de un elemento.
//  1) Antes de que corra cualquier script del prototipo, se le fija su location.hash al mismo valor.
//  2) Si el "#" es un id (no una ruta "#/…"), al cargar se lleva ese elemento a la vista; reintenta
//     ~4 s por si el prototipo arma su contenido con JavaScript.
//  3) Si el "#" de esta página cambia con el visor ya abierto, se le pasa al prototipo.
const SHELL_SCRIPT = `(function(parts,sandbox,title){
var f=document.createElement("iframe"),h=location.hash,t;
if(/[<>]/.test(h))h="";
f.setAttribute("sandbox",sandbox);f.title=title;
f.srcdoc=parts[0]+(h?"<script>location.hash="+JSON.stringify(h)+"<\\/script>":"")+parts[1];
document.body.appendChild(f);
function go(){var id=decodeURIComponent(location.hash.slice(1));if(!id||id.charAt(0)==="/")return true;try{var d=f.contentDocument,el=d.getElementById(id)||d.getElementsByName(id)[0];if(el){el.scrollIntoView();return true}}catch(e){return true}return false}
function run(){clearInterval(t);var n=0;if(go())return;t=setInterval(function(){if(go()||++n>20)clearInterval(t)},200)}
f.addEventListener("load",run);
addEventListener("hashchange",function(){try{f.contentWindow.location.hash=location.hash}catch(e){}run()});
})`;

// Punto donde se inyecta el script del "#": justo después de <head> (o del doctype), para no sacar al
// prototipo del modo estándar.
function injectionPoint(source: string) {
  const head = source.match(/<head(?:\s[^>]*)?>/i);
  if (head?.index !== undefined) return head.index + head[0].length;
  return source.match(/^\s*<!doctype[^>]*>/i)?.[0].length ?? 0;
}

export function htmlShell(title: string, source: string) {
  const at = injectionPoint(source);
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeText(title)}</title>
<style>html,body{margin:0;height:100%;background:#fff}iframe{display:block;border:0;width:100%;height:100%}</style></head>
<body><script>${SHELL_SCRIPT}(${jsonForScript([source.slice(0, at), source.slice(at)])},${jsonForScript(HTML_SANDBOX)},${jsonForScript(title)});</script></body></html>`;
}
