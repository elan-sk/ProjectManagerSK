/** Ajusta el alto de un textarea a su contenido (el tope lo pone el max-height del CSS). */
export function fitToContent(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}
