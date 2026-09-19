// Barra de 5 bloques (cada uno = 20 %): relleno verde/amarillo/rojo según el
// avance, vacío en blanco — WhatsApp solo admite texto, así que el "color" son
// los cuadrados emoji. Corta a propósito (5 y no 10) para que en un celular
// entre en una sola línea junto a su etiqueta; los números van en la línea de
// abajo (ver notifications.ts).
export const PROGRESS_BAR_BLOCKS = 5;

export function progressBar(pct: number) {
  // Se redondea al bloque más cercano, pero la barra solo se llena del todo al
  // 100 % (un 90 % no debe verse como "completo").
  const max = pct >= 100 ? PROGRESS_BAR_BLOCKS : PROGRESS_BAR_BLOCKS - 1;
  const filled = Math.min(max, Math.max(0, Math.round((pct / 100) * PROGRESS_BAR_BLOCKS)));
  const block = pct >= 70 ? "🟩" : pct >= 40 ? "🟨" : "🟥";
  return block.repeat(filled) + "⬜".repeat(PROGRESS_BAR_BLOCKS - filled);
}
