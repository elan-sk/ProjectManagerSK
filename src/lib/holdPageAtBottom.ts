// Tablero y Gantt: con la página abajo del todo (panel completo en pantalla,
// ver imanes en globals.css), subir no la mueve enseguida — hay un colchón para
// que un giro de más no saque el foco de la vista. Lo que tenga scroll propio
// hacia arriba (una columna, el Gantt) sigue scrolleando normal; recién cuando
// llega a su tope empieza a contar el colchón. Hacia abajo no se toca nada.
// - El gesto que trae una columna hasta su tope (con su inercia) nunca pasa.
// - Un gesto nuevo, empezado con todo en el tope, mueve la página solo después
//   de empujar CUSHION_PX hacia arriba.
// Devuelve la función de limpieza (para useEffect).
const CUSHION_PX = 600; // ~5-6 muescas de rueda
const GESTURE_GAP_MS = 300; // pausa entre eventos de rueda que separa un gesto del siguiente
const PANEL = ".sticky-view-panel-kanban, .sticky-view-panel-gantt";

export function holdPageAtBottom() {
  let pushed = 0;
  let lastWheel = -Infinity;
  let startedHeld = false;
  let touchY = 0;
  const root = document.documentElement;
  const atBottom = () => window.innerHeight + window.scrollY >= root.scrollHeight - 2;
  // true = subir movería la página estando abajo del todo.
  const held = (target: EventTarget | null) => {
    if (!atBottom()) return false;
    for (let n = target as Element | null; n && n !== root; n = n.parentElement) {
      if (n.scrollTop > 0) return false; // ese elemento todavía puede subir
    }
    return true;
  };
  const hold = (up: number) => {
    if (!startedHeld) return true;
    pushed += up;
    return pushed < CUSHION_PX;
  };
  const onWheel = (e: WheelEvent) => {
    if (e.timeStamp - lastWheel > GESTURE_GAP_MS) {
      pushed = 0;
      startedHeld = held(e.target);
    }
    lastWheel = e.timeStamp;
    if (e.deltaY > 0) {
      pushed = 0;
      // Bajar con el puntero sobre el panel = quiere trabajar ahí: la página
      // baja también hasta dejarlo completo, aunque la columna scrollee.
      if (!atBottom() && (e.target as Element).closest?.(PANEL)) {
        window.scrollTo({ top: root.scrollHeight, behavior: "smooth" });
      }
    }
    if (e.deltaY >= 0 || !held(e.target)) return;
    // deltaMode 1 = líneas (Firefox): se pasa a píxeles aproximados.
    if (hold(-e.deltaY * (e.deltaMode === 1 ? 40 : 1))) e.preventDefault();
  };
  const onTouchStart = (e: TouchEvent) => {
    touchY = e.touches[0].clientY;
    pushed = 0;
    startedHeld = held(e.target);
  };
  const onTouchMove = (e: TouchEvent) => {
    const y = e.touches[0].clientY;
    const down = y - touchY; // el dedo baja = el contenido sube
    touchY = y;
    if (down <= 0 || !held(e.target)) return;
    if (hold(down * 2) && e.cancelable) e.preventDefault();
  };
  window.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("touchstart", onTouchStart, { passive: true });
  window.addEventListener("touchmove", onTouchMove, { passive: false });
  return () => {
    window.removeEventListener("wheel", onWheel);
    window.removeEventListener("touchstart", onTouchStart);
    window.removeEventListener("touchmove", onTouchMove);
  };
}
