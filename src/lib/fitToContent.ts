/**
 * Ajusta el alto de un textarea a su contenido (el tope lo pone el max-height del CSS).
 * Suma el borde: con box-sizing border-box, solo scrollHeight deja el campo 2 px corto y
 * aparece la barra de desplazamiento con una sola línea. La barra solo se muestra al llegar al tope.
 */
export function fitToContent(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
  el.style.overflowY = el.scrollHeight > el.clientHeight ? "auto" : "hidden";
}
