// Nunca incluir el User completo en una respuesta serializada (JSON de API,
// o cualquier lugar que pueda llegar crudo al cliente): trae passwordHash.
// cargo es el cargo general de la persona (informativo, no da permisos).
export const PUBLIC_USER_SELECT = { id: true, name: true, username: true, email: true, role: true, cargo: true } as const;
