# Historial 008

- 2026-10-12 — Fuentes: pedido del chat y código (modelo de usuario, acciones de Configuración, regla de contraseñas). Biblioteca Depura: no se consultó; es una función propia de esta app.
- 2026-10-12 — Entrevista: historial conservado como «Usuario eliminado»; nuevo PM obligatorio en el formulario; tareas vigentes = asignada y revisora sin completar; contraseñas creadas (incluidas «Solo yo») y accesos por «Personas concretas».
- 2026-10-12 — Especificación aprobada. Plan aprobado.
- 2026-10-12 — T1: campo `deletedAt` y migración `20261012120000_user_deleted_at`. `migrate dev` no sirve en la base local (sin permiso para la base temporal): el SQL salió de `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` y se aplicó con `migrate deploy`.
- 2026-10-12 — T2 a T5 implementadas. Verificación: `tsc` sin errores; `verify:delete-user`, `verify:credentials` y `verify:subprojects` OK; lint sin errores ni avisos nuevos.
- 2026-10-12 — Decisión al implementar: si quien recibe ya tiene el otro papel en una tarea (es asignado y la persona eliminada era revisora, o al revés), no recibe el segundo papel, porque la app no permite ser asignado y revisor de la misma tarea.
- 2026-10-12 — Sin probar en navegador: el formulario y los botones de Configuración → Usuarios.
