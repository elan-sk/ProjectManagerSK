// Barra de 10 bloques (cada uno = 10 %): █ lleno, ░ vacío. Son caracteres de
// texto angostos (no emojis), así que los 10 caben en una sola línea en el
// celular junto a su etiqueta; el porcentaje va a continuación (ver
// notifications.ts).
export const PROGRESS_BAR_BLOCKS = 10;

export function progressBar(pct: number) {
  // Se redondea al bloque más cercano, pero la barra solo se llena del todo al
  // 100 % (un 96 % no debe verse como "completo").
  const max = pct >= 100 ? PROGRESS_BAR_BLOCKS : PROGRESS_BAR_BLOCKS - 1;
  const filled = Math.min(max, Math.max(0, Math.round((pct / 100) * PROGRESS_BAR_BLOCKS)));
  return "█".repeat(filled) + "░".repeat(PROGRESS_BAR_BLOCKS - filled);
}
