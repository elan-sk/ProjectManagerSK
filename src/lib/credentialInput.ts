import { z } from "zod";

// Cuerpo de la API para crear/editar una contraseña (credencial). `password` vacío o ausente al editar
// = se conserva la actual. `userIds` solo cuenta con visibility "USERS".
export const credentialBodySchema = z.object({
  name: z.string().min(1),
  url: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  notes: z.string().optional(),
  visibility: z.enum(["ALL", "PROJECT", "USERS"]).optional(),
  userIds: z.array(z.string()).optional(),
  taskId: z.string().optional(),
});
