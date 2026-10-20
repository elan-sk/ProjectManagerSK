// Tablero y Gantt: con la página abajo del todo (panel completo en pantalla,
// ver imanes en globals.css), subir no la mueve enseguida — hay un colchón para
// que un giro de más no saque el foco de la vista. Lo que tenga scroll propio
// hacia arriba (una columna, el Gantt) sigue scrolleando normal; recién cuando
// llega a su tope empieza a contar el colchón. Hacia abajo no se toca nada.
// - El gesto que trae una columna hasta su tope (con su inercia) nunca pasa.
// - Un gesto nuevo, empezado con todo en el tope, mueve la página solo después
//   de empujar CUSHION_PX hacia arriba (rueda) o TOUCH_CUSHION_PX (dedo). El dedo
//   usa un colchón corto y lo recuerda entre arrastres seguidos (TOUCH_MEMORY_MS).
// - Mientras se empuja, una franja teal sobre el borde superior del panel se llena y brilla
//   más (sin deformar las columnas) para que se vea que el imán retiene y que seguir
//   empujando lo suelta.
// Devuelve la función de limpieza (para useEffect).
const CUSHION_PX = 600; // ~5-6 muescas de rueda
const TOUCH_CUSHION_PX = 90; // dedo: alcanza con un arrastre corto, o dos seguidos
const TOUCH_MEMORY_MS = 1200; // el empuje del dedo se recuerda este tiempo entre arrastres
const MAX_PULL_PX = 36; // alto del resplandor del aviso del imán
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
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // ratio: 0 = en reposo, 1 = justo antes de soltar la página.
  // Aviso del imán: una franja teal sobre el borde superior del panel que se llena desde el
  // centro, con un resplandor que se intensifica. Va en una capa aparte (fija, sin eventos)
  // y solo anima opacity/transform: las columnas no se deforman ni se vuelven a pintar.
  // Un cambio por cuadro (rAF) y siempre con transición corta: sin saltos en el dedo.
  let overlay: HTMLDivElement | null = null;
  let bar: HTMLDivElement | null = null;
  let shown = 0;
  let pending = 0;
  let frame = 0;
  let cleanTimer: ReturnType<typeof setTimeout> | undefined;
  const paint = () => {
    frame = 0;
    const ratio = pending;
    if (ratio === shown) return;
    if (!shown) {
      clearTimeout(cleanTimer);
      const panel = document.querySelector<HTMLElement>(PANEL);
      if (!panel) return;
      const box = panel.getBoundingClientRect();
      overlay?.remove();
      overlay = document.createElement("div");
      overlay.setAttribute("aria-hidden", "true");
      Object.assign(overlay.style, {
        position: "fixed",
        top: `${box.top}px`,
        left: `${box.left}px`,
        width: `${box.width}px`,
        height: `${MAX_PULL_PX}px`,
        pointerEvents: "none",
        zIndex: "30",
        borderRadius: "1rem 1rem 0 0",
        background: "linear-gradient(to bottom, rgba(10, 107, 120, 0.3), rgba(10, 107, 120, 0))",
        opacity: "0",
      });
      bar = document.createElement("div");
      Object.assign(bar.style, {
        height: "3px",
        borderRadius: "9999px",
        background: "rgb(10, 107, 120)",
        transform: "scaleX(0)",
      });
      overlay.appendChild(bar);
      document.body.appendChild(overlay);
    }
    if (!overlay || !bar) return;
    const ms = ratio ? 120 : 220;
    overlay.style.transition = `opacity ${ms}ms ease-out`;
    bar.style.transition = `transform ${ms}ms ease-out`;
    overlay.style.opacity = String(ratio ? 0.35 + 0.65 * ratio : 0);
    bar.style.transform = `scaleX(${ratio})`;
    shown = ratio;
    // En reposo, la capa se quita cuando termina de apagarse.
    if (!ratio) {
      const done = overlay;
      cleanTimer = setTimeout(() => {
        done.remove();
        if (overlay === done) overlay = bar = null;
      }, 240);
    }
  };
  const stretch = (ratio: number) => {
    if (reduceMotion) return;
    pending = ratio;
    if (!frame) frame = requestAnimationFrame(paint);
  };
  let relaxTimer: ReturnType<typeof setTimeout> | undefined;
  const relaxAfter = (ms: number) => {
    clearTimeout(relaxTimer);
    relaxTimer = setTimeout(() => {
      pushed = 0;
      stretch(0);
    }, ms);
  };
  const hold = (up: number, cushion: number, memoryMs: number) => {
    if (!startedHeld) return true;
    pushed += up;
    const holding = pushed < cushion;
    stretch(holding ? pushed / cushion : 0);
    relaxAfter(memoryMs);
    return holding;
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
    if (hold(-e.deltaY * (e.deltaMode === 1 ? 40 : 1), CUSHION_PX, GESTURE_GAP_MS + 50)) e.preventDefault();
  };
  const onTouchStart = (e: TouchEvent) => {
    touchY = e.touches[0].clientY;
    startedHeld = held(e.target); // pushed se conserva: lo limpia relaxAfter si pasa la pausa
  };
  const onTouchMove = (e: TouchEvent) => {
    const y = e.touches[0].clientY;
    const down = y - touchY; // el dedo baja = el contenido sube
    touchY = y;
    if (down <= 0 || !held(e.target)) return;
    if (hold(down, TOUCH_CUSHION_PX, TOUCH_MEMORY_MS) && e.cancelable) e.preventDefault();
  };
  // Al soltar, el panel vuelve a su lugar; el empuje acumulado se recuerda un rato.
  const onTouchEnd = () => stretch(0);
  window.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("touchstart", onTouchStart, { passive: true });
  window.addEventListener("touchmove", onTouchMove, { passive: false });
  window.addEventListener("touchend", onTouchEnd, { passive: true });
  window.addEventListener("touchcancel", onTouchEnd, { passive: true });
  return () => {
    clearTimeout(relaxTimer);
    clearTimeout(cleanTimer);
    cancelAnimationFrame(frame);
    overlay?.remove();
    window.removeEventListener("touchend", onTouchEnd);
    window.removeEventListener("touchcancel", onTouchEnd);
    window.removeEventListener("wheel", onWheel);
    window.removeEventListener("touchstart", onTouchStart);
    window.removeEventListener("touchmove", onTouchMove);
  };
}
