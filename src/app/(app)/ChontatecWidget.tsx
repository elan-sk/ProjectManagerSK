"use client";

import { CHAT_ASK_EVENT } from "@/lib/chatBridge";
import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { getChatHistory, sendChontatecMessage, confirmChontatecAction, clearChatHistory } from "./chontatecActions";
import { Avatar } from "@/components/Avatar";
import { useConfirm } from "@/components/Confirm";
import { XIcon, SpeakerIcon, SpeakerOffIcon, TrashIcon, ExpandIcon, MicIcon } from "@/components/icons";
import { useDictation } from "@/components/useDictation";
import { appendDictation } from "@/lib/dictation";
import { fitToContent } from "@/lib/fitToContent";
import { Hotkey, isAltShortcut } from "@/components/Hotkey";
import { useFileViewer } from "@/components/FileViewer";
import { withUploadNote } from "@/lib/chatUploadNote";
import { ChatMessages, type ChatUiMessage } from "@/components/chat/ChatMessages";
import { useChatAttachments } from "@/components/chat/useChatAttachments";
import { stripMarkdownForSpeech } from "@/components/chat/chatMarkdown";
import { AssistantComposer, AssistantTurns, useStickToBottom } from "@/components/chat/AssistantChat";
import { useVoiceRecorder } from "@/components/useVoiceRecorder";

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
  const textRef = useRef<HTMLTextAreaElement>(null);
  // Reajusta el alto también cuando el texto cambia por dictado o al enviar.
  useLayoutEffect(() => fitToContent(textRef.current), [text]);
  const [isPending, startTransition] = useTransition();
  const lastPending = messages.length > 0 ? messages[messages.length - 1].pendingAction : undefined;
  const { attached, setAttached, openPicker, dropHandlers, fileInput, chips, dropOverlay } = useChatAttachments(!lastPending && !isPending);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  // Respuestas que llegaron con el chat cerrado: insignia sobre el ícono hasta que se abra.
  const [unread, setUnread] = useState(0);
  if (open && unread > 0) setUnread(0);
  const openRef = useRef(open);
  openRef.current = open;
  function markUnread() {
    if (!openRef.current) setUnread((n) => n + 1);
  }
  const fileViewer = useFileViewer();
  // Clics dentro del visor de archivos (va en portal, fuera del panel) no deben cerrar el chat.
  const viewerOpenRef = useRef(false);
  viewerOpenRef.current = fileViewer.isOpen;
  const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;
  const {
    supported: canDictate,
    listening,
    interim,
    error: dictationError,
    stop: stopDictation,
    toggle: toggleDictation,
  } = useDictation((spoken) => setText((current) => appendDictation(current, spoken)));
  const voice = useVoiceRecorder((spoken) => handleSend(appendDictation(text, spoken)));
  // Alt+L con el historial sin cargar: se lee apenas llega.
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
    if (!open && listening) stopDictation();
  }, [open, listening, stopDictation]);
  useEffect(() => {
    return () => {
      if (canSpeak) window.speechSynthesis.cancel();
    };
  }, [canSpeak]);

  // Alt+C abre/cierra el chat desde cualquier lugar, también escribiendo
  // en un campo (no choca con la edición de texto).
  // Alt+L lee en voz alta el último mensaje del bot (abre el chat si hace falta);
  // repetido mientras lee, lo detiene.
  // Esc en pantalla completa vuelve al tamaño normal (con el visor de archivos abierto, Esc es del visor).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isAltShortcut(e, "KeyC")) {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (isAltShortcut(e, "KeyL")) {
        e.preventDefault();
        setOpen(true);
        if (!canSpeak) return;
        if (loaded) {
          if (lastAssistant) toggleSpeak(lastAssistant.id, lastAssistant.text);
        } else speakLastOnLoad.current = true;
      } else if (e.key === "Escape" && open && expanded && voice.state === "idle" && !e.defaultPrevented && !viewerOpenRef.current) {
        setExpanded(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });

  useEffect(() => {
    function onAsk(e: Event) {
      const value = (e as CustomEvent<{ text?: string }>).detail?.text ?? "";
      setOpen(true);
      setExpanded(true);
      setText(value);
      requestAnimationFrame(() => {
        const el = textRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(value.length, value.length);
      });
    }
    window.addEventListener(CHAT_ASK_EVENT, onAsk);
    return () => window.removeEventListener(CHAT_ASK_EVENT, onAsk);
  }, []);

  const onScroll = useStickToBottom(scrollRef, `${open}:${expanded}:${messages.length}:${optimisticMessage ? 1 : 0}:${isPending}:${voice.state}`, `${open}:${expanded}:${loaded}`);
  const cancelVoice = voice.cancel;
  useEffect(() => {
    if (!open || !expanded) cancelVoice();
  }, [open, expanded, cancelVoice]);

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

  // Una falla del servidor se muestra en el propio chat: nunca debe tumbar la página.
  function showSendError() {
    setMessages((prev) => [...prev, { id: `error-${Date.now()}`, role: "system", text: "No se pudo procesar el mensaje. Intentarlo de nuevo en un momento." }]);
  }

  function handleSend(raw = text) {
    const typed = raw.trim();
    if ((!typed && attached.length === 0) || isPending) return;
    if (listening) stopDictation();
    // Los archivos subidos viajan como texto con su ruta: el bot los adjunta a la tarea que se le pida.
    const value = withUploadNote(typed, attached);
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
        markUnread();
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
      } finally {
        markUnread();
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
          aria-label={`Abrir chat con ${botName}${!open && unread > 0 ? ` (${unread} sin leer)` : ""}`}
          className="relative rounded-full shadow-[0_8px_24px_rgba(15,23,42,0.25)] transition hover:scale-105"
        >
          <Avatar name={botName} avatarUrl={botAvatarUrl} size="h-12 w-12 text-sm" />
          {!open && unread > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-semibold text-white ring-2 ring-white">
              {unread}
            </span>
          )}
        </button>
        {/* Con el chat abierto el panel queda justo arriba: las insignias van a la izquierda del botón. */}
        <span className={`pointer-events-none absolute flex flex-col items-end gap-1 ${open ? "top-1/2 right-full mr-2 -translate-y-1/2" : "right-0 bottom-full mb-1.5"}`}>
          <Hotkey mod="Alt" keys="C" label={open ? "Cerrar chat" : "Abrir chat"} />
          {canSpeak && <Hotkey mod="Alt" keys="L" label="Leer respuesta" />}
        </span>
      </div>

      {open && expanded && <div className="fixed inset-0 z-40 bg-slate-900/30" onClick={() => setExpanded(false)} />}
      {open && (
        <div
          {...dropHandlers}
          className={`fixed z-50 flex flex-col overflow-hidden rounded-2xl bg-white shadow-[0_8px_30px_rgba(15,23,42,0.18)] ${
            expanded ? "inset-3 md:inset-y-6 md:right-auto md:left-1/2 md:w-[min(54rem,calc(100vw-1.5rem))] md:-translate-x-1/2" : "right-3 bottom-[4.5rem] h-[32rem] max-h-[75vh] w-96 max-w-[calc(100vw-1.5rem)]"
          }`}
        >
          {dropOverlay}
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

          <div ref={scrollRef} onScroll={onScroll} className={`flex-1 overflow-y-auto overflow-x-hidden ${expanded ? "" : "space-y-2 p-3"}`}>
            {expanded ? (
              <div className="mx-auto max-w-3xl space-y-7 px-4 py-8 sm:px-6">
                {!loaded && <p className="text-base text-slate-400">Cargando…</p>}
                {loaded && messages.length === 0 && (
                  <div className="flex gap-3">
                    <span className="hidden shrink-0 sm:block">
                      <Avatar name={botName} avatarUrl={botAvatarUrl} size="h-9 w-9 text-xs" />
                    </span>
                    <p className="pt-1 text-[17px] leading-[1.7] text-slate-900">¡Ey, qué más! Soy {botName} 🙌 Preguntame por tus proyectos, tareas o tiempos.</p>
                  </div>
                )}
                <AssistantTurns
                  messages={messages}
                  optimisticMessage={optimisticMessage}
                  isPending={isPending}
                  botName={botName}
                  botAvatarUrl={botAvatarUrl}
                  openFile={fileViewer.open}
                  onConfirm={handleConfirm}
                  renderAssistantActions={(m) =>
                    canSpeak && m.text ? (
                      <button
                        type="button"
                        onClick={() => toggleSpeak(m.id, m.text)}
                        aria-label={speakingId === m.id ? "Detener lectura" : "Leer en voz alta"}
                        className="group relative mt-1 shrink-0 rounded-full p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-700"
                      >
                        {speakingId === m.id ? <SpeakerOffIcon className="h-4 w-4" /> : <SpeakerIcon className="h-4 w-4" />}
                        {m.id === lastAssistant?.id && <Hotkey mod="Alt" keys="L" className="absolute top-0 right-full mr-1" />}
                      </button>
                    ) : null
                  }
                />
              </div>
            ) : (
              <>
            {loaded && messages.length === 0 && (
              <div className="rounded-2xl bg-slate-100 px-3 py-2 text-sm text-slate-700">
                ¡Ey, qué más! Soy {botName} 🙌 Preguntame por tus proyectos, tareas o tiempos.
              </div>
            )}
            {!loaded && <p className="p-2 text-sm text-slate-400">Cargando…</p>}

            <ChatMessages
              messages={messages}
              optimisticMessage={optimisticMessage}
              isPending={isPending}
              botName={botName}
              openFile={fileViewer.open}
              onConfirm={handleConfirm}
              renderAssistantActions={(m) =>
                canSpeak && m.text ? (
                  <button
                    type="button"
                    onClick={() => toggleSpeak(m.id, m.text)}
                    aria-label={speakingId === m.id ? "Detener lectura" : "Leer en voz alta"}
                    className="group relative mt-0.5 shrink-0 rounded-full p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                  >
                    {speakingId === m.id ? <SpeakerOffIcon className="h-3.5 w-3.5" /> : <SpeakerIcon className="h-3.5 w-3.5" />}
                    {m.id === lastAssistant?.id && <Hotkey mod="Alt" keys="L" className="absolute top-0 right-full mr-1" />}
                  </button>
                ) : null
              }
            />
              </>
            )}
          </div>

          {expanded ? (
            <footer className="px-4 pt-2 pb-4 sm:px-6 sm:pb-6">
              <div className="mx-auto max-w-3xl">
                <AssistantComposer
                  text={text}
                  setText={setText}
                  onSend={() => handleSend()}
                  canWrite={!lastPending && !isPending && voice.state !== "transcribing"}
                  hasAttachments={attached.length > 0}
                  openPicker={openPicker}
                  fileInput={fileInput}
                  chips={chips}
                  voice={voice}
                  placeholder="Preguntale algo…"
                  blockedNotice={lastPending ? "Confirmá o cancelá la acción de arriba primero." : null}
                />
              </div>
            </footer>
          ) : (
          <footer className="border-t border-slate-100 p-2">
            {lastPending ? (
              <p className="px-1 py-1.5 text-center text-xs text-slate-400">Confirmá o cancelá la acción de arriba primero.</p>
            ) : (
              <div className="space-y-1">
              {(listening || dictationError) && (
                <p className={`truncate px-1 text-[11px] ${dictationError ? "text-red-600" : "text-slate-400"}`} aria-live="polite">
                  {dictationError ?? (interim || "Escuchando…")}
                </p>
              )}
              {chips}
              <div className="flex items-end gap-2">
                <button type="button" onClick={openPicker} disabled={isPending} title="Subir un archivo al chat" aria-label="Subir un archivo al chat" className="cursor-pointer rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-500 hover:bg-slate-50 disabled:opacity-60">
                  📎
                </button>
                {fileInput}
                <div className="relative flex-1">
                  <textarea
                    ref={textRef}
                    rows={1}
                    autoFocus
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (canDictate && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
                        e.preventDefault();
                        toggleDictation();
                        return;
                      }
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder="Preguntale algo…"
                    disabled={isPending}
                    className={`block max-h-40 w-full resize-none overflow-y-auto rounded-lg border border-slate-300 py-1.5 pl-3 text-sm disabled:opacity-60 ${canDictate ? "pr-10" : "pr-3"}`}
                  />
                  {canDictate && (
                    <button
                      type="button"
                      onClick={toggleDictation}
                      disabled={isPending}
                      aria-pressed={listening}
                      title={listening ? "Detener el dictado (Ctrl + D)" : "Dictar por voz (Ctrl + D)"}
                      aria-label={listening ? "Detener el dictado" : "Dictar por voz"}
                      className={`absolute bottom-0.5 right-1 flex h-7 w-7 cursor-pointer items-center justify-center rounded-md disabled:opacity-60 ${listening ? "animate-pulse bg-red-600 text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"}`}
                    >
                      <MicIcon className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleSend()}
                  disabled={isPending || (!text.trim() && attached.length === 0)}
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {isPending ? "…" : "Enviar"}
                </button>
              </div>
              </div>
            )}
          </footer>
          )}
        </div>
      )}
    </div>
  );
}
