import type { TaskStatus } from "@prisma/client";
import { TASK_STATUS_LABEL } from "@/lib/statusColors";
import { absoluteUrl, appUrl } from "@/lib/appUrl";

const ALERT_LABEL: Record<string, string> = {
  overdue: "⚠️ Vencida",
  warning: "⏳ Por vencer",
  blocked: "⛔ Bloqueada",
  lateStart: "⚠️ Inicio retrasado",
};

export const WHATSAPP_CHUNK = 3500;

export function normalizePhone(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

function toAbsolute(url: string) {
  return url.startsWith("/") ? absoluteUrl(url) ?? url : url;
}

export function toWhatsAppText(markdown: string) {
  let text = markdown.replace(/<!--[\s\S]*?-->/g, "");
  text = text.replace(/\[\[person:([^|\]]+)\|[^\]]*\]\]/g, "$1");
  text = text.replace(/\[\[project:([^|\]]+)\|[^\]]*\]\]/g, "$1");
  text = text.replace(/\[\[status:([A-Z_]+)\]\]/g, (_m, code: string) => TASK_STATUS_LABEL[code as TaskStatus] ?? code);
  text = text.replace(/\[\[alert:([A-Za-z]+)\]\]/g, (_m, level: string) => ALERT_LABEL[level] ?? "");
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, url: string) => {
    const full = toAbsolute(url);
    return label.trim() === url || label.trim() === full ? full : `${label}: ${full}`;
  });
  text = text.replace(/\*\*([^*\n]+)\*\*/g, "*$1*");
  text = text.replace(/__([^_\n]+)__/g, "*$1*");
  text = text.replace(/^#{1,6}\s+(.+)$/gm, "*$1*");
  text = text.replace(/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/gm, "");
  text = text.replace(/^\s*\|(.+)\|\s*$/gm, (_m, row: string) => row.split("|").map((c) => c.trim()).filter(Boolean).join(" · "));
  text = text.replace(/^(\s*)\* /gm, "$1- ");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

export function splitWhatsApp(text: string, max = WHATSAPP_CHUNK) {
  const parts: string[] = [];
  let rest = text.trim();
  while (rest.length > max) {
    let cut = rest.lastIndexOf("\n", max);
    if (cut < max / 2) cut = rest.lastIndexOf(" ", max);
    if (cut <= 0) cut = max;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

export function extractUploadFiles(markdown: string) {
  const base = appUrl();
  const found = new Map<string, string>();
  for (const m of markdown.matchAll(/\[([^\]]+)\]\(([^)\s]+)\)/g)) {
    const url = base && m[2].startsWith(base) ? m[2].slice(base.length) : m[2];
    if (/^\/uploads\/[A-Za-z0-9._-]+$/.test(url) && !/\.html?$/i.test(url)) found.set(url, m[1].trim());
  }
  return [...found].map(([url, name]) => ({ url, name }));
}

const CONFIRM_WORDS = new Set(["si", "dale", "confirmar", "confirmo", "confirma", "ok", "okay", "listo", "de una", "hagale", "si confirmar", "si dale"]);
const DECLINE_WORDS = new Set(["no", "cancelar", "cancela", "cancelo", "no gracias", "mejor no"]);

export function parseConfirmation(text: string): "confirm" | "decline" | null {
  const clean = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (CONFIRM_WORDS.has(clean)) return "confirm";
  if (DECLINE_WORDS.has(clean)) return "decline";
  return null;
}
