export const DEFAULT_UPLOAD_TEXT = "Subí este archivo.";

export function withUploadNote(text: string, files: { name: string; url: string }[]) {
  if (files.length === 0) return text;
  return `${text || DEFAULT_UPLOAD_TEXT}\n\n[Archivos subidos en el chat: ${files.map((f) => `"${f.name}" → ${f.url}`).join(", ")}]`;
}

const UPLOAD_NOTE = /\n\n\[Archivos subidos en el chat: ([\s\S]*)\]$/;

export function splitUploadNote(text: string): { text: string; files: { name: string; url: string }[] } {
  const match = text.match(UPLOAD_NOTE);
  if (!match) return { text, files: [] };
  const files = [...match[1].matchAll(/"([^"]+)" → (\S+?)(?=, "|$)/g)].map((m) => ({ name: m[1], url: m[2] }));
  const body = text.slice(0, match.index).trim();
  return { text: body === DEFAULT_UPLOAD_TEXT ? "" : body, files };
}
