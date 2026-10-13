import { z } from "zod";

// Roles del equipo en un proyecto (pestaña Definición) y cargo general de una
// persona. Los dos son INFORMATIVOS: sirven para que el equipo y el bot sepan
// quién hace qué, y nunca cambian permisos (eso sigue en permissions.ts).
// La validación vive acá, en un solo lugar, para que la app, la API por URL y
// el chat rechacen exactamente lo mismo.

export const CARGO_MAX = 80;
export const ROLE_MAX = 120;

// Texto libre de una línea: se recortan los extremos y los espacios de más, y
// vacío significa "sin dato" (null), no una cadena con espacios.
export const optionalLine = (max: number) =>
  z
    .string()
    .transform((s) => s.replace(/\s+/g, " ").trim())
    .refine((s) => s.length <= max, {
      message: `No puede superar los ${max} caracteres.`,
    })
    .transform((s) => (s.length === 0 ? null : s));

export const cargoSchema = optionalLine(CARGO_MAX);
// Un rol cargado no puede quedar vacío: o se describe, o no hay fila.
export const roleSchema = z
  .string()
  .transform((s) => s.replace(/\s+/g, " ").trim())
  .refine((s) => s.length > 0, {
    message: "Escribí qué hace esta persona en el proyecto.",
  })
  .refine((s) => s.length <= ROLE_MAX, {
    message: `El rol no puede superar los ${ROLE_MAX} caracteres.`,
  });

/** Un rol tal como lo consumen la app, el bot y la API. */
export type ProjectRoleView = {
  userId: string;
  name: string;
  cargo: string | null;
  role: string;
};
