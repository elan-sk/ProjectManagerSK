"use client";

import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { getChatHistory, sendChontatecMessage, confirmChontatecAction, clearChatHistory } from "./chontatecActions";
import { Avatar } from "@/components/Avatar";
import { ProjectIcon } from "@/components/ProjectIcon";
import { ALERT_STYLE, ALERT_LEVEL_LABEL } from "@/components/AlertBadge";
import { TASK_STATUS_COLOR, TASK_STATUS_LABEL } from "@/lib/statusColors";
import { useConfirm } from "@/components/Confirm";
import { XIcon, SpeakerIcon, SpeakerOffIcon, TrashIcon } from "@/components/icons";
import type { TaskStatus } from "@prisma/client";
import type { TaskAlert } from "@/lib/delays";

type ChatUiMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  pendingAction?: { toolUseId: string; label: string; destructive: boolean };
};

// Markdown mínimo que puede mandar el bot: **negrita**, [texto](url), y
// miniaturas propias de la interfaz [[tipo:datos]] (persona/proyecto/estado/
// alerta, ver buildOperatingRules en chontatec.ts) — nada de librerías,
// alcanza con un split por regex. Los saltos de línea del texto se
// resuelven aparte con whitespace-pre-wrap.
const INLINE_MARKDOWN = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|\[\[[a-z]+:[^\]]*\]\])/g;

function renderInlineMarkdown(text: string) {
  return text.split(INLINE_MARKDOWN).map((part, i) => {
    const bold = part.match(/^\*\*([^*]+)\*\*$/);
    if (bold) return <strong key={i}>{bold[1]}</strong>;

    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      return (
        <Link key={i} href={link[2]} className="underline decoration-dotted underline-offset-2 hover:text-slate-950">
          {link[1]}
        </Link>
      );
    }

    const chip = part.match(/^\[\[([a-z]+):([^\]]*)\]\]$/);
    if (chip) {
      const [, type, rawArgs] = chip;
      const args = rawArgs.split("|");
      const rendered = renderChip(i, type, args);
      if (rendered) return rendered;
    }

    return <Fragment key={i}>{part}</Fragment>;
  });
}

function renderChip(key: number, type: string, args: string[]) {
  if (type === "person") {
    const [name, avatarUrl] = args;
    if (!name) return null;
    return (
      <span key={key} className="inline-flex items-center gap-1 align-middle">
        <Avatar name={name} avatarUrl={avatarUrl || null} size="h-4 w-4 text-[7px]" />
        {name}
      </span>
    );
  }

  if (type === "project") {
    const [name, projectId, iconUrl] = args;
    if (!name) return null;
    const chipBody = (
      <span className="inline-flex items-center gap-1 align-middle">
        <ProjectIcon name={name} iconUrl={iconUrl || null} size="h-4 w-4 text-[7px] rounded" />
        {name}
      </span>
    );
    return projectId ? (
      <Link key={key} href={`/projects/${projectId}`} className="hover:underline">
        {chipBody}
      </Link>
    ) : (
      <Fragment key={key}>{chipBody}</Fragment>
    );
  }

  if (type === "status") {
    const code = args[0] as TaskStatus;
    const color = TASK_STATUS_COLOR[code];
    const label = TASK_STATUS_LABEL[code];
    if (!color || !label) return null;
    return (
      <span key={key} className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium ${color.badge}`}>
        {label}
      </span>
    );
  }

  if (type === "alert") {
    const level = args[0] as TaskAlert["level"];
    const style = ALERT_STYLE[level];
    const label = ALERT_LEVEL_LABEL[level];
    if (!style || !label) return null;
    return (
      <span key={key} className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium ${style}`}>
        {label}
      </span>
    );
  }

  return null;
}

// Lo que no se debe leer en voz alta: marcado de negrita/links/miniaturas de
// Markdown — de persona/proyecto solo interesa el nombre; de estado/alerta,
// la etiqueta en español (no el código crudo en inglés).
function stripMarkdownForSpeech(text: string): string {
  return text
    .replace(/\[\[([a-z]+):([^\]]*)\]\]/g, (_match, type: string, rawArgs: string) => {
      const [first] = rawArgs.split("|");
      if (type === "status") return TASK_STATUS_LABEL[first as TaskStatus] ?? first;
      if (type === "alert") return ALERT_LEVEL_LABEL[first as TaskAlert["level"]] ?? first;
      return first ?? "";
    })
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/[*_#`]/g, "");
}

export function ChontatecWidget({ botName, botAvatarUrl }: { botName: string; botAvatarUrl: string | null }) {
  const pathname = usePathname();
  const confirm = useConfirm();
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [messages, setMessages] = useState<ChatUiMessage[]>([]);
  const [text, setText] = useState("");
  const [isPending, startTransition] = useTransition();
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    if (!open || loaded) return;
    getChatHistory().then((history) => {
      setMessages(history);
      setLoaded(true);
    });
  }, [open, loaded]);

  // Cortar la lectura si se cierra el panel o se desmonta el widget — que no
  // siga hablando de fondo con el chat cerrado.
  useEffect(() => {
    if (!open && canSpeak) window.speechSynthesis.cancel();
  }, [open, canSpeak]);
  useEffect(() => {
    return () => {
      if (canSpeak) window.speechSynthesis.cancel();
    };
  }, [canSpeak]);

  useEffect(() => {
    if (!open) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, open]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const lastPending = messages.length > 0 ? messages[messages.length - 1].pendingAction : undefined;

  function handleSend() {
    const value = text.trim();
    if (!value || isPending) return;
    setText("");
    startTransition(async () => {
      const updated = await sendChontatecMessage(value, pathname);
      setMessages(updated);
    });
  }

  function handleConfirm(toolUseId: string, decision: "confirm" | "decline") {
    startTransition(async () => {
      const updated = await confirmChontatecAction(toolUseId, decision);
      setMessages(updated);
    });
  }

  async function handleClearChat() {
    const ok = await confirm("¿Borrar todo el historial de este chat? No se puede deshacer.", {
      confirmLabel: "Borrar",
      danger: true,
    });
    if (!ok) return;
    await clearChatHistory();
    setMessages([]);
  }

  function toggleSpeak(id: string, textToSpeak: string) {
    if (!canSpeak) return;
    window.speechSynthesis.cancel();
    if (speakingId === id) {
      setSpeakingId(null);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(stripMarkdownForSpeech(textToSpeak));
    utterance.lang = "es-CO";
    utterance.onend = () => setSpeakingId(null);
    utterance.onerror = () => setSpeakingId(null);
    setSpeakingId(id);
    window.speechSynthesis.speak(utterance);
  }

  return (
    <div ref={containerRef}>
      <div className="group fixed bottom-3 right-3 z-40">
        {!open && (
          <span className="pointer-events-none absolute right-full top-1/2 mr-4 -translate-y-1/2 translate-x-1 whitespace-nowrap rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 opacity-0 shadow-[0_12px_30px_rgba(15,23,42,0.2)] transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100">
            Hablá con {botName}
            <span className="absolute left-full top-1/2 -translate-y-1/2 border-[7px] border-transparent border-l-slate-200" />
            <span className="absolute left-full top-1/2 -translate-x-px -translate-y-1/2 border-[6px] border-transparent border-l-white" />
          </span>
        )}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={`Abrir chat con ${botName}`}
          className="rounded-full shadow-[0_8px_24px_rgba(15,23,42,0.25)] transition hover:scale-105"
        >
          <Avatar name={botName} avatarUrl={botAvatarUrl} size="h-12 w-12 text-sm" />
        </button>
      </div>

      {open && (
        <div className="fixed bottom-24 right-6 z-40 flex h-[32rem] max-h-[75vh] w-96 max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_8px_30px_rgba(15,23,42,0.18)]">
          <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <Avatar name={botName} avatarUrl={botAvatarUrl} size="h-7 w-7 text-[11px]" />
              <span className="text-sm font-medium text-slate-900">{botName}</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleClearChat}
                aria-label="Limpiar chat"
                title="Limpiar chat"
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar" className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <XIcon className="h-4 w-4" />
              </button>
            </div>
          </header>

          <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto overflow-x-hidden p-3">
            {loaded && messages.length === 0 && (
              <div className="rounded-2xl bg-slate-100 px-3 py-2 text-sm text-slate-700">
                ¡Ey, qué más! Soy {botName} 🙌 Preguntame por tus proyectos, tareas o tiempos.
              </div>
            )}
            {!loaded && <p className="p-2 text-sm text-slate-400">Cargando…</p>}

            {messages.map((m) => {
              if (m.role === "system") {
                return (
                  <p key={m.id} className="text-center text-xs text-slate-400">
                    {m.text}
                  </p>
                );
              }
              return (
                <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                      m.role === "user" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-800"
                    }`}
                  >
                    <div className="flex items-start gap-1.5">
                      <span className="flex-1 whitespace-pre-wrap">{renderInlineMarkdown(m.text)}</span>
                      {m.role === "assistant" && canSpeak && m.text && (
                        <button
                          type="button"
                          onClick={() => toggleSpeak(m.id, m.text)}
                          aria-label={speakingId === m.id ? "Detener lectura" : "Leer en voz alta"}
                          className="mt-0.5 shrink-0 rounded-full p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                        >
                          {speakingId === m.id ? <SpeakerOffIcon className="h-3.5 w-3.5" /> : <SpeakerIcon className="h-3.5 w-3.5" />}
                        </button>
                      )}
                    </div>
                    {m.pendingAction && (
                      <div
                        className={`mt-2 space-y-1.5 rounded-lg border p-2 text-slate-800 ${
                          m.pendingAction.destructive ? "border-red-200 bg-red-50" : "border-transparent bg-white"
                        }`}
                      >
                        <p className={`text-xs font-medium ${m.pendingAction.destructive ? "text-red-700" : ""}`}>{m.pendingAction.label}</p>
                        {m.pendingAction.destructive && (
                          <p className="text-[11px] text-red-600">Esta acción no se puede deshacer — confirmá con cuidado.</p>
                        )}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => handleConfirm(m.pendingAction!.toolUseId, "confirm")}
                            className={`rounded-lg px-2.5 py-1 text-xs font-medium text-white disabled:opacity-60 ${
                              m.pendingAction.destructive ? "bg-red-600 hover:bg-red-700" : "bg-slate-900 hover:bg-slate-800"
                            }`}
                          >
                            {m.pendingAction.destructive ? "Sí, eliminar" : "Confirmar"}
                          </button>
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => handleConfirm(m.pendingAction!.toolUseId, "decline")}
                            className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                          >
                            No, cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <footer className="border-t border-slate-100 p-2">
            {lastPending ? (
              <p className="px-1 py-1.5 text-center text-xs text-slate-400">Confirmá o cancelá la acción de arriba primero.</p>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSend();
                  }}
                  placeholder="Preguntale algo…"
                  disabled={isPending}
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={isPending || !text.trim()}
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {isPending ? "…" : "Enviar"}
                </button>
              </div>
            )}
          </footer>
        </div>
      )}
    </div>
  );
}
