// Dónde se crea o se agrega una contraseña (credencial). Sin "use client" ni prisma: lo comparten el
// navegador (formularios, fichas) y el servidor (acciones, API).
export type CredentialPlace = { projectId: string } | { taskId: string } | { stepId: string } | { adjustmentItemId: string };

export type CredentialEventName = "VIEW" | "REVEAL" | "COPY_URL" | "COPY_USERNAME" | "COPY_PASSWORD";

export const CREDENTIAL_EVENT_LABEL: Record<CredentialEventName, string> = {
  VIEW: "Abrió la contraseña",
  REVEAL: "Mostró la contraseña",
  COPY_URL: "Copió la URL",
  COPY_USERNAME: "Copió el usuario",
  COPY_PASSWORD: "Copió la contraseña",
};

/** Texto del botón para quitarla del lugar donde se está viendo. */
export function removeFromPlaceLabel(place: CredentialPlace) {
  if ("stepId" in place) return "Quitar de este paso";
  if ("adjustmentItemId" in place) return "Quitar de este ajuste";
  if ("taskId" in place) return "Quitar de esta tarea";
  return null;
}
