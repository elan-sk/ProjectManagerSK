import assert from "node:assert/strict";
import {
  cargoSchema,
  roleSchema,
  ROLE_MAX,
  CARGO_MAX,
} from "../src/lib/projectRoles";

// Cargo de la persona (Configuración → Usuarios) y rol en un proyecto (Definición):
// texto libre de una línea, recortado, con tope de largo. Vacío = sin dato (null).
assert.equal(cargoSchema.parse("  Diseñador   UX  "), "Diseñador UX");
assert.equal(cargoSchema.parse(""), null);
assert.equal(cargoSchema.parse("   "), null);
assert.equal(cargoSchema.safeParse("x".repeat(CARGO_MAX)).success, true);
assert.equal(cargoSchema.safeParse("x".repeat(CARGO_MAX + 1)).success, false);

// Un rol cargado no puede quedar vacío: o describe qué hace la persona, o no hay fila.
assert.equal(
  roleSchema.parse("  Enlace   con el cliente "),
  "Enlace con el cliente",
);
assert.equal(roleSchema.safeParse("").success, false);
assert.equal(roleSchema.safeParse("   ").success, false);
assert.equal(roleSchema.safeParse("x".repeat(ROLE_MAX)).success, true);
assert.equal(roleSchema.safeParse("x".repeat(ROLE_MAX + 1)).success, false);

console.log(
  "OK — cargo y roles: texto de una línea, sin vacíos en el rol y con tope de largo",
);
