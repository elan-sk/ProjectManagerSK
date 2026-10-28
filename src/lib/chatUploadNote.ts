export const DEFAULT_UPLOAD_TEXT = "Subí este archivo.";

export function withUploadNote(text: string, files: { name: string; url: string }[]) {
  if (files.length === 0) return text;
  return `${text || DEFAULT_UPLOAD_TEXT}\n\n[Archivos subidos en el chat: ${files.map((f) => `"${f.name}" → ${f.url}`).join(", ")}]`;
}
