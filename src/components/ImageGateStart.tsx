"use client";

import { useEffect } from "react";

// Avisa al script de imágenes (src/lib/imageGate.ts) que React ya hidrató: desde ahí puede marcar
// cada imagen descargada para mostrarla sin que React lo tome como diferencia con el servidor.
export function ImageGateStart() {
  useEffect(() => window.__pmskImageGateStart?.(), []);
  return null;
}
