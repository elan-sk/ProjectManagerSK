// Spec 001: aviso cuando un archivo o link ya estaba en esa misma sección. Sin
// prisma ni "use client": lo usan las acciones del servidor y los componentes.
export const ALREADY_LOADED = "Este archivo ya está cargado aquí.";

export function alreadyLoadedMessage(names: string[]) {
  return names.length === 1 ? ALREADY_LOADED : `Ya estaban cargados aquí: ${names.join(", ")}.`;
}

/** true si el resultado de una acción de adjuntar dice que ya estaba cargado. */
export function isDuplicate(result: unknown): boolean {
  return typeof result === "object" && result !== null && (result as { duplicate?: boolean }).duplicate === true;
}
