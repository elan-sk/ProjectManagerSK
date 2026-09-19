import { normalizeSearchText } from "@/lib/search";

// Búsqueda difusa por palabras: sin mayúsculas ni tildes (normalizeSearchText),
// tolera errores de tipeo (distancia de edición) y no exige que la frase
// coincida al pie de la letra ni en el mismo orden.
// ponytail: recorre en memoria los candidatos que le pasan — alcanza para el
// volumen de un equipo (miles de filas); si crece, mover a un índice
// FULLTEXT de MariaDB y dejar esto solo para reordenar.

const words = (s: string) => normalizeSearchText(s).split(/[^a-z0-9ñ]+/).filter(Boolean);

// Damerau-Levenshtein (con transposición: "tarea" ↔ "taera" cuenta como 1).
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

// 0 = no coincide; 1 = exacta; prefijo/contiene puntúan alto; un error
// tipográfico puntúa menos según cuántos permite el largo de la palabra.
function tokenScore(token: string, word: string): number {
  if (word === token) return 1;
  if (word.startsWith(token)) return 0.9;
  if (token.length >= 3 && word.includes(token)) return 0.7;
  const maxErrors = token.length <= 3 ? 0 : token.length <= 6 ? 1 : 2;
  if (maxErrors === 0) return 0;
  // Compara contra la palabra completa y contra su prefijo del largo del
  // token (así "proyect" con typo aún encuentra "proyectos").
  const dist = Math.min(editDistance(token, word, maxErrors), editDistance(token, word.slice(0, token.length), maxErrors));
  return dist <= maxErrors ? 0.6 - dist * 0.1 : 0;
}

/** Puntaje 0..1 de `text` frente a `query` (0 = no coincide). Basta con que coincida ~60% de las palabras de la consulta. */
export function fuzzyScore(query: string, text: string): number {
  const tokens = words(query);
  if (tokens.length === 0) return 0;
  const textWords = words(text);
  if (textWords.length === 0) return 0;

  let total = 0;
  let matched = 0;
  for (const token of tokens) {
    let best = 0;
    for (const w of textWords) {
      best = Math.max(best, tokenScore(token, w));
      if (best === 1) break;
    }
    if (best > 0) matched++;
    total += best;
  }
  if (matched < Math.ceil(tokens.length * 0.6)) return 0;
  return total / tokens.length;
}
