// Chequeo del script de imágenes (src/lib/imageGate.ts) con un DOM mínimo simulado: lo serializado
// corre solo (sin imports), una imagen a la vista cuenta como pendiente hasta su «load», recién se
// marca después de hidratar y una diferida fuera de pantalla no deja la barra prendida.
import assert from "node:assert/strict";
import { IMAGE_GATE_SCRIPT } from "../src/lib/imageGate";

type Img = { tagName: "IMG"; nodeType: 1; complete: boolean; isConnected: boolean; attrs: Set<string>; setAttribute(a: string): void; removeAttribute(a: string): void };
const img = (): Img => ({ tagName: "IMG", nodeType: 1, complete: false, isConnected: true, attrs: new Set(), setAttribute(a) { this.attrs.add(a); }, removeAttribute(a) { this.attrs.delete(a); } });

const listeners: Record<string, (e: { target: unknown }) => void> = {};
const all: Img[] = [];
let mo: (list: unknown[]) => void = () => {};
let io: (entries: { target: Img; isIntersecting: boolean }[]) => void = () => {};
const classes = new Set<string>();
const win: Record<string, unknown> = { dispatchEvent() {}, setTimeout() {} };
Object.assign(win, { IntersectionObserver: class { constructor(cb: typeof io) { io = cb; } observe() {} unobserve() {} } });
Object.assign(globalThis, {
  window: win,
  IntersectionObserver: win.IntersectionObserver,
  MutationObserver: class { constructor(cb: typeof mo) { mo = cb; } observe() {} },
  document: { documentElement: { classList: { add: (c: string) => classes.add(c) } }, addEventListener: (t: string, f: (e: { target: unknown }) => void) => (listeners[t] = f), querySelectorAll: () => all },
});

new Function(IMAGE_GATE_SCRIPT)();
const pending = () => (win.__pmskImagesPending as number) ?? 0;
assert.ok(classes.has("img-gate"));

const visible = img();
const lazyOff = img();
all.push(visible, lazyOff);
mo([{ type: "childList", removedNodes: [], addedNodes: [visible, lazyOff] }]);
io([{ target: visible, isIntersecting: true }, { target: lazyOff, isIntersecting: false }]);
assert.equal(pending(), 1, "solo la visible cuenta");

listeners.load({ target: visible });
assert.equal(pending(), 0, "al descargar deja de contar");
assert.equal(visible.attrs.size, 0, "antes de hidratar no se marca");

(win.__pmskImageGateStart as () => void)();
assert.ok(visible.attrs.has("data-img-ready"), "al hidratar se muestra la ya descargada");
assert.ok(!lazyOff.attrs.has("data-img-ready"), "la que falta sigue oculta");

listeners.error({ target: lazyOff });
assert.ok(lazyOff.attrs.has("data-img-ready"), "con error también se muestra");

visible.complete = false;
mo([{ type: "attributes", target: visible }]);
assert.ok(!visible.attrs.has("data-img-ready"), "otra dirección: vuelve a ocultarse");
console.log("verify-image-gate: ok");
