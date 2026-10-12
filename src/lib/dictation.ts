const PUNCTUATION: Record<string, string> = {
  coma: ",",
  punto: ".",
  "punto y coma": ";",
  "dos puntos": ":",
  interrogacion: "?",
  "signo de interrogacion": "?",
  exclamacion: "!",
  admiracion: "!",
  "signo de exclamacion": "!",
  guion: "-",
  arroba: "@",
};

const normalize = (spoken: string) =>
  spoken
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[.,;:!?¿¡]+$/, "")
    .trim();

export function appendDictation(current: string, spoken: string) {
  const piece = spoken.trim();
  if (!piece) return current;
  const mark = PUNCTUATION[normalize(piece)];
  if (mark !== undefined) return current.replace(/\s+$/, "") + mark;
  return current && !/\s$/.test(current) ? `${current} ${piece}` : current + piece;
}
