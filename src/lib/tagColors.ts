import { DEFAULT_COLORS } from "@/components/ProjectIcon";

/**
 * Colores para elegir en las categorías de etiqueta, ordenados por tono. Distintos a propósito de la paleta
 * apagada de los íconos de proyecto (DEFAULT_COLORS), donde los tonos se confundían: aquí el par más
 * parecido está a ΔE 13,1 en OKLab (la anterior: 5,8), todos saturados y con contraste ≥ 3:1 sobre blanco
 * (se usan como color del texto de la ficha). Validado con el validador de paletas de la guía de gráficos.
 * Con daltonismo algunos pares se acercan: la ficha siempre lleva el nombre de la categoría.
 */
export const TAG_CATEGORY_COLORS = [
  "#b91c1c", // rojo
  "#ea580c", // naranja
  "#a16207", // ocre
  "#4d7c0f", // verde oliva
  "#0d9488", // turquesa
  "#0369a1", // azul océano
  "#6366f1", // índigo
  "#7e22ce", // morado
  "#c026d3", // fucsia
  "#db2777", // rosado
];

/** Las categorías creadas antes conservan su color de la paleta vieja (sigue siendo válido). */
export const ALLOWED_TAG_CATEGORY_COLORS = [...TAG_CATEGORY_COLORS, ...DEFAULT_COLORS];
