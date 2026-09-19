// Barra de 10 bloques (cada uno = 10%): relleno verde/amarillo/rojo según el
// avance, vacío en blanco — WhatsApp solo admite texto, así que el "color" son
// los cuadrados emoji.
export function progressBar(pct: number) {
  const filled = Math.min(10, Math.max(0, Math.floor(pct / 10)));
  const block = pct >= 70 ? "🟩" : pct >= 40 ? "🟨" : "🟥";
  return block.repeat(filled) + "⬜".repeat(10 - filled);
}
