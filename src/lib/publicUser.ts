// Nunca incluir el User completo en una respuesta serializada (JSON de API,
// o cualquier lugar que pueda llegar crudo al cliente): trae passwordHash.
export const PUBLIC_USER_SELECT = { id: true, name: true, email: true, role: true } as const;
