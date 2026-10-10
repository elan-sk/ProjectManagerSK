"use client";

import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { getChatHistory, sendChontatecMessage, confirmChontatecAction, clearChatHistory } from "./chontatecActions";
import { Avatar } from "@/components/Avatar";
import { ProjectIcon } from "@/components/ProjectIcon";
import { ALERT_STYLE, ALERT_LEVEL_LABEL } from "@/components/AlertBadge";
import { TASK_STATUS_COLOR, TASK_STATUS_LABEL, PROJECT_PHASE_LABEL } from "@/lib/statusColors";
import { useConfirm } from "@/components/Confirm";
import { XIcon, SpeakerIcon, SpeakerOffIcon, TrashIcon, ExpandIcon } from "@/components/icons";
import type { TaskStatus } from "@prisma/client";
import type { TaskAlert } from "@/lib/delays";
import { uploadWithProgress } from "@/lib/uploadWithProgress";
import { Hotkey, isAppShortcut } from "@/components/Hotkey";
import { isFileHref, useFileViewer, type ViewFile } from "@/components/FileViewer";

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

function renderInlineMarkdown(text: string, openFile: (f: ViewFile) => void) {
  return text.split(INLINE_MARKDOWN).map((part, i) => {
    const bold = part.match(/^\*\*([^*]+)\*\*$/);
    if (bold) return <strong key={i}>{renderInlineMarkdown(bold[1], openFile)}</strong>;

    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    // Link a un archivo (subido a la app o con extensión conocida): se abre en su visor, no se descarga.
    if (link && isFileHref(link[2])) {
      return (
        <button key={i} type="button" onClick={() => openFile({ url: link[2], name: link[1] })} className="cursor-pointer underline decoration-dotted underline-offset-2 hover:text-slate-950">
          {link[1]}
        </button>
      );
    }
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

const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_SEPARATOR = /^\s*\|?(\s*:?-{3,}:?\s*\|)+\s*:?-{0,}:?\s*\|?\s*$/;

function tableCells(line: string) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

function renderMessage(text: string, openFile: (f: ViewFile) => void) {
  const lines = text.split("\n");
  const blocks: ({ kind: "text"; lines: string[] } | { kind: "table"; header: string[]; rows: string[][] })[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (TABLE_ROW.test(lines[i]) && TABLE_SEPARATOR.test(lines[i + 1] ?? "")) {
      const header = tableCells(lines[i]);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && TABLE_ROW.test(lines[i])) rows.push(tableCells(lines[i++]));
      i--;
      blocks.push({ kind: "table", header, rows });
      continue;
    }
    const last = blocks[blocks.length - 1];
    if (last?.kind === "text") last.lines.push(lines[i]);
    else blocks.push({ kind: "text", lines: [lines[i]] });
  }
  return blocks.map((b, i) => {
    if (b.kind === "text") {
      const body = b.lines.join("\n").replace(/^\n+|\n+$/g, "");
      return body ? (
        <span key={i} className="block whitespace-pre-wrap">
          {renderInlineMarkdown(body, openFile)}
        </span>
      ) : null;
    }
    return (
      <div key={i} className="my-1.5 overflow-x-auto">
        <table className="w-full border-collapse text-xs leading-snug">
          <thead>
            <tr>
              {b.header.map((h, j) => (
                <th key={j} className="border-b border-slate-300 px-1.5 py-1 text-left align-bottom font-semibold">
                  {renderInlineMarkdown(h, openFile)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {b.rows.map((r, j) => (
              <tr key={j}>
                {b.header.map((_, k) => (
                  <td key={k} className="border-b border-slate-200 px-1.5 py-1 align-top">
                    {renderInlineMarkdown(r[k] ?? "", openFile)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  });
}

const PROJECT_PHASE_STATUS: Record<keyof typeof PROJECT_PHASE_LABEL, TaskStatus> = {
  PLANNING: "NOT_STARTED",
  ACTIVE: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
};

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
    const [name, projectId, iconUrl, parentName, parentIconUrl] = args;
    if (!name) return null;
    const chipBody = (
      <span className="inline-flex items-center gap-1 align-middle">
        <ProjectIcon name={name} iconUrl={iconUrl || null} parent={parentName ? { name: parentName, iconUrl: parentIconUrl || null } : null} inline size="h-4 w-4 text-[7px] rounded" />
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
    const phase = args[0] as keyof typeof PROJECT_PHASE_LABEL;
    const code = (PROJECT_PHASE_STATUS[phase] && !(args[0] in TASK_STATUS_LABEL) ? PROJECT_PHASE_STATUS[phase] : args[0]) as TaskStatus;
    const color = TASK_STATUS_COLOR[code];
    const label = args[0] in TASK_STATUS_LABEL ? TASK_STATUS_LABEL[code] : PROJECT_PHASE_LABEL[phase];
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
      if (type === "status") return TASK_STATUS_LABEL[first as TaskStatus] ?? PROJECT_PHASE_LABEL[first as keyof typeof PROJECT_PHASE_LABEL] ?? first;
      if (type === "alert") return ALERT_LEVEL_LABEL[first as TaskAlert["level"]] ?? first;
      return first ?? "";
    })
    .replace(/^\s*\|?(\s*:?-{3,}:?\s*\|?)+\s*$/gm, "")
    .replace(/^\s*\|(.*)\|\s*$/gm, (_m, row: string) => row.split("|").map((c) => c.trim()).join(", ") + ".")
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
  const [expanded, setExpanded] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [messages, setMessages] = useState<ChatUiMessage[]>([]);
  const [optimisticMessage, setOptimisticMessage] = useState<ChatUiMessage | null>(null);
  const [text, setText] = useState("");
  const [attached, setAttached] = useState<{ name: string; url: string }[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const fileViewer = useFileViewer();
  // Clics dentro del visor de archivos (va en portal, fuera del panel) no deben cerrar el chat.
  const viewerOpenRef = useRef(false);
  viewerOpenRef.current = fileViewer.isOpen;
  const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;
  // Ctrl+I con el historial sin cargar: se lee apenas llega.
  const speakLastOnLoad = useRef(false);
  const lastAssistant = messages.findLast((m) => m.role === "assistant" && m.text);

  useEffect(() => {
    if (!open || loaded) return;
    getChatHistory().then((history) => {
      setMessages(history);
      setLoaded(true);
      if (speakLastOnLoad.current) {
        speakLastOnLoad.current = false;
        const last = history.findLast((m) => m.role === "assistant" && m.text);
        if (last) toggleSpeak(last.id, last.text);
      }
    });
    // toggleSpeak solo se usa una vez al cargar: no debe re-disparar la carga.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Ctrl+Espacio abre/cierra el chat desde cualquier lugar, también escribiendo
  // en un campo (no choca con la edición de texto).
  // Ctrl+I lee en voz alta el último mensaje del bot (abre el chat si hace falta);
  // repetido mientras lee, lo detiene.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.code === "Space") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (isAppShortcut(e, "i")) {
        e.preventDefault();
        setOpen(true);
        if (!canSpeak) return;
        if (loaded) {
          if (lastAssistant) toggleSpeak(lastAssistant.id, lastAssistant.text);
        } else speakLastOnLoad.current = true;
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });

  useEffect(() => {
    if (!open) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, optimisticMessage, open]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node) && !viewerOpenRef.current) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const lastPending = messages.length > 0 ? messages[messages.length - 1].pendingAction : undefined;

  async function handleFile(file: File) {
    setUploadError(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const { ok, body } = await uploadWithProgress("/api/upload", form);
      if (!ok) throw new Error(body.error ?? "No se pudo subir el archivo.");
      setAttached((prev) => [...prev, { name: body.name, url: body.url }]);
    } catch (err) {
      setUploadError((err as Error).message);
    }
  }

  // Varios archivos a la vez (botón, arrastrar y soltar, pegar): uno detrás de otro.
  async function handleFiles(files: File[]) {
    for (const file of files) await handleFile(file);
  }

  // Arrastrar y soltar o pegar (Ctrl+V) archivos en el panel: mismo camino que el botón 📎.
  // Con una acción por confirmar no se adjunta nada (el campo de texto tampoco está).
  const canAttach = !lastPending && !isPending;
  const hasFiles = (types: readonly string[]) => types.includes("Files");
  function handleDragOver(e: React.DragEvent) {
    if (!canAttach || !hasFiles(e.dataTransfer.types)) return;
    e.preventDefault();
    setDragOver(true);
  }
  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false);
  }
  function handleDrop(e: React.DragEvent) {
    if (!hasFiles(e.dataTransfer.types)) return;
    e.preventDefault();
    setDragOver(false);
    if (canAttach) void handleFiles(Array.from(e.dataTransfer.files));
  }
  function handlePaste(e: React.ClipboardEvent) {
    const files = Array.from(e.clipboardData.files);
    if (!canAttach || files.length === 0) return;
    // preventDefault también le avisa a usePasteImage (áreas de subida de la página) que ya se atendió.
    e.preventDefault();
    void handleFiles(files);
  }

  // Una falla del servidor se muestra en el propio chat: nunca debe tumbar la página.
  function showSendError() {
    setMessages((prev) => [...prev, { id: `error-${Date.now()}`, role: "system", text: "No se pudo procesar el mensaje. Intentarlo de nuevo en un momento." }]);
  }

  function handleSend() {
    const typed = text.trim();
    if ((!typed && attached.length === 0) || isPending) return;
    // Los archivos subidos viajan como texto con su ruta: el bot los adjunta a la tarea que se le pida.
    const value = attached.length
      ? `${typed || "Subí este archivo."}\n\n[Archivos subidos en el chat: ${attached.map((f) => `"${f.name}" → ${f.url}`).join(", ")}]`
      : typed;
    setText("");
    setAttached([]);
    setOptimisticMessage({ id: `pending-${Date.now()}`, role: "user", text: value });
    startTransition(async () => {
      try {
        const updated = await sendChontatecMessage(value, pathname);
        setMessages(updated);
      } catch (err) {
        console.error("[chat] no se pudo enviar el mensaje", err);
        showSendError();
      } finally {
        setOptimisticMessage(null);
      }
    });
  }

  function handleConfirm(toolUseId: string, decision: "confirm" | "decline") {
    startTransition(async () => {
      try {
        const updated = await confirmChontatecAction(toolUseId, decision);
        setMessages(updated);
      } catch (err) {
        console.error("[chat] no se pudo confirmar la acción", err);
        showSendError();
      }
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
      {fileViewer.viewer}
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
        {/* Con el chat abierto el panel queda justo arriba: las insignias van a la izquierda del botón. */}
        <span className={`pointer-events-none absolute flex flex-col items-end gap-1 ${open ? "top-1/2 right-full mr-2 -translate-y-1/2" : "right-0 bottom-full mb-1.5"}`}>
          <Hotkey keys="Espacio" label={open ? "Cerrar chat" : "Abrir chat"} />
          {canSpeak && <Hotkey keys="I" label="Leer respuesta" />}
        </span>
      </div>

      {open && expanded && <div className="fixed inset-0 z-40 bg-slate-900/30" onClick={() => setExpanded(false)} />}
      {open && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onPaste={handlePaste}
          className={`fixed z-50 flex flex-col overflow-hidden rounded-2xl bg-white shadow-[0_8px_30px_rgba(15,23,42,0.18)] ${
            expanded ? "inset-3 md:inset-x-[8%] md:inset-y-6" : "right-3 bottom-[4.5rem] h-[32rem] max-h-[75vh] w-96 max-w-[calc(100vw-1.5rem)]"
          }`}
        >
          {dragOver && (
            <div className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-[#0a6b78] bg-white/90 text-sm font-medium text-[#0a6b78]">
              Soltar aquí para adjuntar
            </div>
          )}
          <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <Avatar name={botName} avatarUrl={botAvatarUrl} size="h-7 w-7 text-[11px]" />
              <span className="text-sm font-medium text-slate-900">{botName}</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                aria-label={expanded ? "Tamaño normal" : "Pantalla completa"}
                aria-pressed={expanded}
                title={expanded ? "Tamaño normal" : "Pantalla completa"}
                className={`rounded-full p-1 hover:bg-slate-100 hover:text-slate-700 ${expanded ? "text-slate-700" : "text-slate-400"}`}
              >
                <ExpandIcon className="h-4 w-4" />
              </button>
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
                      <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">{renderMessage(m.text, fileViewer.open)}</div>
                      {m.role === "assistant" && canSpeak && m.text && (
                        <button
                          type="button"
                          onClick={() => toggleSpeak(m.id, m.text)}
                          aria-label={speakingId === m.id ? "Detener lectura" : "Leer en voz alta"}
                          className="group relative mt-0.5 shrink-0 rounded-full p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                        >
                          {speakingId === m.id ? <SpeakerOffIcon className="h-3.5 w-3.5" /> : <SpeakerIcon className="h-3.5 w-3.5" />}
                          {m.id === lastAssistant?.id && <Hotkey keys="I" className="absolute top-0 right-full mr-1" />}
                        </button>
                      )}
                    </div>
                    {m.pendingAction && (
                      <div
                        className={`mt-2 space-y-1.5 rounded-lg border p-2 text-slate-800 ${
                          m.pendingAction.destructive ? "border-red-200 bg-red-50" : "border-transparent bg-white"
                        }`}
                      >
                        <p className={`whitespace-pre-line text-xs font-medium [overflow-wrap:anywhere] ${m.pendingAction.destructive ? "text-red-700" : ""}`}>{m.pendingAction.label}</p>
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
            {optimisticMessage && (
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-slate-900 px-3 py-2 text-sm text-white">
                  <span className="whitespace-pre-wrap">{optimisticMessage.text}</span>
                </div>
              </div>
            )}
            {isPending && (
              <div className="flex justify-start" aria-live="polite" aria-label={`${botName} está procesando tu mensaje`}>
                <div className="flex h-8 items-center gap-1 rounded-2xl bg-slate-100 px-3" role="status">
                  <span className="sr-only">{botName} está escribiendo</span>
                  <i aria-hidden="true" className="typing-dot h-1.5 w-1.5 rounded-full bg-[#0a6b78] [animation-delay:0ms] motion-reduce:animate-none" />
                  <i aria-hidden="true" className="typing-dot h-1.5 w-1.5 rounded-full bg-[#0a6b78] [animation-delay:120ms] motion-reduce:animate-none" />
                  <i aria-hidden="true" className="typing-dot h-1.5 w-1.5 rounded-full bg-[#0a6b78] [animation-delay:240ms] motion-reduce:animate-none" />
                </div>
              </div>
            )}
          </div>

          <footer className="border-t border-slate-100 p-2">
            {lastPending ? (
              <p className="px-1 py-1.5 text-center text-xs text-slate-400">Confirmá o cancelá la acción de arriba primero.</p>
            ) : (
              <div className="space-y-1">
              {(attached.length > 0 || uploadError) && (
                <div className="flex flex-wrap items-center gap-1 px-1 text-[11px]">
                  {attached.map((f) => (
                    <span key={f.url} className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                      {f.name}
                      <button type="button" aria-label={`Quitar ${f.name}`} onClick={() => setAttached((prev) => prev.filter((x) => x.url !== f.url))} className="cursor-pointer text-slate-400 hover:text-slate-900">×</button>
                    </span>
                  ))}
                  {uploadError && <span className="text-red-600">{uploadError}</span>}
                </div>
              )}
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isPending} title="Subir un archivo al chat" aria-label="Subir un archivo al chat" className="cursor-pointer rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-500 hover:bg-slate-50 disabled:opacity-60">
                  📎
                </button>
                <input ref={fileInputRef} type="file" multiple hidden onChange={(e) => { void handleFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
                <input
                  autoFocus
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
                  disabled={isPending || (!text.trim() && attached.length === 0)}
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {isPending ? "…" : "Enviar"}
                </button>
              </div>
              </div>
            )}
          </footer>
        </div>
      )}
    </div>
  );
}
