// Imágenes sin «carga a pedazos» (pedido del usuario): cada <img> queda invisible (conserva su lugar)
// hasta que termina de descargarse, y la barra de estado dice «Cargando imágenes…» mientras haya
// alguna pendiente a la vista. Va como script en línea al comienzo del <body> (layout raíz) para que
// actúe ya en la primera pintada, antes de que cargue React.
//
// La marca de lista (data-img-ready) recién se pone después de hidratar (ImageGateStart llama a
// __pmskImageGateStart): React avisa en desarrollo si encuentra atributos que no puso él. Hasta ese
// momento el CSS oculta todas y al hidratar aparecen juntas las ya descargadas.
// Es texto (JS plano) y no una función con toString(): el compilador le agrega auxiliares propios.

export const IMAGES_EVENT = "pmsk:images";

declare global {
  interface Window {
    __pmskImageGateStart?: () => void;
    __pmskImagesPending?: number;
  }
}

export const IMAGE_GATE_SCRIPT = `(function () {
  var A = "data-img-ready", doc = document, started = false;
  doc.documentElement.classList.add("img-gate");
  var loaded = new WeakSet();
  // Pendientes a la vista: una imagen diferida (loading="lazy") fuera de pantalla no se descarga y no
  // debe dejar la barra prendida.
  var pending = new Set();
  function emit() {
    pending.forEach(function (i) { if (!i.isConnected || loaded.has(i)) pending.delete(i); });
    window.__pmskImagesPending = pending.size;
    window.dispatchEvent(new Event("${IMAGES_EVENT}"));
  }
  var io = "IntersectionObserver" in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting && !loaded.has(e.target)) pending.add(e.target); else pending.delete(e.target);
    });
    emit();
  }) : null;
  function ready(i) {
    loaded.add(i);
    if (started) i.setAttribute(A, "");
    if (io) io.unobserve(i);
    if (pending.delete(i)) emit();
  }
  // Imagen nueva o con otra dirección: si ya está completa (en caché) se muestra; si no, se espera.
  function check(i) {
    if (i.complete) return ready(i);
    loaded.delete(i);
    i.removeAttribute(A);
    if (io) io.observe(i);
  }
  // También con error: la imagen rota se ve como antes (no queda oculta para siempre).
  function onDone(e) { if (e.target && e.target.tagName === "IMG") ready(e.target); }
  doc.addEventListener("load", onDone, true);
  doc.addEventListener("error", onDone, true);
  new MutationObserver(function (list) {
    var removed = false;
    list.forEach(function (m) {
      if (m.type === "attributes") { if (m.target.tagName === "IMG") check(m.target); return; }
      if (m.removedNodes.length) removed = true;
      m.addedNodes.forEach(function (n) {
        if (n.nodeType !== 1) return;
        if (n.tagName === "IMG") check(n); else n.querySelectorAll("img").forEach(check);
      });
    });
    if (removed) emit();
  }).observe(doc.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["src", "srcset"] });
  function start() {
    if (started) return;
    started = true;
    doc.querySelectorAll("img").forEach(function (i) { if (loaded.has(i) || i.complete) ready(i); else check(i); });
  }
  window.__pmskImageGateStart = start;
  // Respaldo: si React no llegara a arrancar, las imágenes no quedan ocultas para siempre.
  window.setTimeout(start, 10000);
})();`;
