import { attachmentFileType } from "@/lib/attachments";

// Opciones "de atributo" del filtro Tipo (param `type`, mismo select que los
// tipos de tarea y los atajos personales): en vez de un tipo, filtran por algo
// que la tarea TIENE. Comparten el select, así que son excluyentes entre sí y
// con los tipos — igual que ya pasa con "Devueltas (a mí)"/"Revisión (mías)".
export const ATTRIBUTE_TYPE_OPTIONS = [
  { id: "NEW", label: "Nuevas", dotColorClass: "bg-violet-500" },
  { id: "WITH_FILES", label: "Archivos adjuntos", dotColorClass: "bg-sky-500" },
  { id: "SHARED", label: "Compartidas", dotColorClass: "bg-emerald-500" },
];

export type AttributeType = "NEW" | "WITH_FILES" | "SHARED";

export function isAttributeType(type: string | undefined): type is AttributeType {
  return type === "NEW" || type === "WITH_FILES" || type === "SHARED";
}

/** Los links pegados (URL) no cuentan como archivo cargado. */
export function hasUploadedFiles(attachments: { mimeType: string }[]) {
  return attachments.some((a) => attachmentFileType(a.mimeType) !== "link");
}

/**
 * NEW = asignada a quien mira y todavía sin abrir; WITH_FILES = tiene algún
 * archivo subido; SHARED = ya tiene un link de compartir activo.
 */
export function matchesAttributeType(
  type: AttributeType,
  flags: { isNewForMe: boolean; hasFiles: boolean; isShared: boolean }
) {
  return type === "NEW" ? flags.isNewForMe : type === "WITH_FILES" ? flags.hasFiles : flags.isShared;
}

/** Color del botón del filtro cuando hay una opción de atributo elegida. */
export function attributeTypeTriggerClass(type: string | undefined) {
  return type === "NEW"
    ? "bg-violet-600 text-white"
    : type === "WITH_FILES"
    ? "bg-sky-600 text-white"
    : type === "SHARED"
    ? "bg-emerald-600 text-white"
    : undefined;
}
