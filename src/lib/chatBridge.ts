export const CHAT_ASK_EVENT = "chontatec:ask";

export function askInChat(text: string) {
  window.dispatchEvent(new CustomEvent(CHAT_ASK_EVENT, { detail: { text } }));
}
