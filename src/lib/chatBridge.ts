export const CHAT_ASK_EVENT = "chontatec:ask";

export type ChatContext = { label: string; prompt: string; autoSend?: string };

export function askInChat(context: ChatContext) {
  window.dispatchEvent(new CustomEvent(CHAT_ASK_EVENT, { detail: context }));
}

export function withHiddenContext(text: string, context: ChatContext | null) {
  return context ? `${text}\n<!--contexto: ${context.prompt.replace(/-->/g, "")}-->` : text;
}

export function stripHiddenContext(text: string) {
  return text.replace(/\n?<!--contexto:[\s\S]*?-->/g, "").trim();
}

export function stripStrayIds(text: string) {
  return text.replace(/\s*[(\[]?(?<![/=\w-])c[a-z0-9]{24}(?![\w-])[)\]]?/g, "");
}
