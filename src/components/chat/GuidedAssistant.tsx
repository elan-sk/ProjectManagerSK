"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "@/lib/useAppRouter";
import { Avatar } from "@/components/Avatar";
import { useConfirm } from "@/components/Confirm";
import { useFileViewer } from "@/components/FileViewer";
import { CheckIcon, MicIcon, PaperclipIcon, TrashIcon, XIcon } from "@/components/icons";
import type { ChatUiMessage } from "@/components/chat/ChatMessages";
import { AssistantComposer, AssistantTurns, SEND_ERROR, useStickToBottom } from "@/components/chat/AssistantChat";
import { useChatAttachments } from "@/components/chat/useChatAttachments";
import { useVoiceRecorder } from "@/components/useVoiceRecorder";
import { appendDictation } from "@/lib/dictation";
import { withUploadNote } from "@/lib/chatUploadNote";

export type GuidedStep = { key: string; label: string; done: boolean; current: boolean };
export type GuidedSteps = { items: GuidedStep[]; covered: number; total: number };
export type GuidedResult = { messages: ChatUiMessage[]; steps: GuidedSteps; redirect?: string | null };
export type GuidedState = GuidedResult & { aiConfigured: boolean };

const START_TEXT = "Empecemos";
const noSubscription = () => () => {};

function Steps({ steps }: { steps: GuidedSteps }) {
  return (
    <ol className="relative">
      {steps.items.map((item, i) => (
        <li key={item.key} className="relative flex gap-3 pb-4 last:pb-0">
          {i < steps.items.length - 1 && <span aria-hidden="true" className={`absolute top-7 bottom-0 left-[13px] w-px ${item.done ? "bg-emerald-500/60" : "bg-slate-200"}`} />}
          <span
            aria-hidden="true"
            className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold ${
              item.done ? "border-emerald-600 bg-emerald-600 text-white" : item.current ? "border-[#0a6b78] bg-white text-[#0a6b78]" : "border-slate-200 bg-white text-slate-400"
            }`}
          >
            {item.done ? <CheckIcon className="h-3.5 w-3.5" /> : i + 1}
          </span>
          <span className={`pt-0.5 text-[15px] leading-snug ${item.current ? "font-semibold text-slate-900" : item.done ? "text-slate-700" : "text-slate-500"}`}>
            {item.label}
            <span className="sr-only">{item.done ? " (completo)" : item.current ? " (en curso)" : " (pendiente)"}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function ProgressBar({ covered, total }: { covered: number; total: number }) {
  return (
    <div className="h-1 w-full bg-slate-50" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={covered}>
      <div className="h-full bg-[#0a6b78] transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${total ? (covered / total) * 100 : 0}%` }} />
    </div>
  );
}

type Props = {
  botName: string;
  botAvatarUrl: string | null;
  subtitle: string;
  exitHref: string;
  introTitle: string;
  introText?: string;
  introDocs: string;
  restartText: string;
  load: () => Promise<GuidedState>;
  sendMessage: (text: string) => Promise<GuidedResult>;
  confirmAction: (toolUseId: string, decision: "confirm" | "decline") => Promise<GuidedResult>;
  restart: () => Promise<GuidedResult>;
  startText?: string | null;
};

export function GuidedAssistant({ botName, botAvatarUrl, subtitle, exitHref, introTitle, introText, introDocs, restartText, load, sendMessage, confirmAction, restart, startText }: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const fileViewer = useFileViewer();
  const scrollRef = useRef<HTMLDivElement>(null);
  const mounted = useSyncExternalStore(noSubscription, () => true, () => false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [aiConfigured, setAiConfigured] = useState(true);
  const [messages, setMessages] = useState<ChatUiMessage[]>([]);
  const [profile, setProfile] = useState<GuidedSteps | null>(null);
  const [optimisticMessage, setOptimisticMessage] = useState<ChatUiMessage | null>(null);
  const [text, setText] = useState("");
  const [topicsOpen, setTopicsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const lastPending = messages.length > 0 ? messages[messages.length - 1].pendingAction : undefined;
  const { attached, setAttached, openPicker, dropHandlers, fileInput, chips, dropOverlay } = useChatAttachments(!lastPending && !isPending);
  const voice = useVoiceRecorder((spoken) => send(appendDictation(text, spoken)));

  useEffect(() => {
    load()
      .then((state) => {
        setMessages(state.messages);
        setProfile(state.steps);
        setAiConfigured(state.aiConfigured);
      })
      .catch((err) => {
        console.error("[asistente] no se pudo cargar", err);
        setLoadError(true);
      })
      .finally(() => setLoaded(true));
  }, [load]);

  const onScroll = useStickToBottom(scrollRef, `${messages.length}:${optimisticMessage ? 1 : 0}:${isPending}:${voice.state}`, `${loaded}:${messages.length > 0 || optimisticMessage !== null}`);

  function apply(result: GuidedResult) {
    setMessages(result.messages);
    setProfile(result.steps);
    if (result.redirect) router.replace(result.redirect);
  }

  function showError() {
    setMessages((prev) => [...prev, { id: `error-${Date.now()}`, role: "system", text: SEND_ERROR }]);
  }

  function send(raw: string) {
    const value = withUploadNote(raw.trim(), attached);
    if (!value || isPending) return;
    setText("");
    setAttached([]);
    setOptimisticMessage({ id: `pending-${Date.now()}`, role: "user", text: value });
    startTransition(async () => {
      try {
        apply(await sendMessage(value));
      } catch (err) {
        console.error("[asistente] no se pudo enviar", err);
        setText(raw);
        showError();
      } finally {
        setOptimisticMessage(null);
      }
    });
  }

  function handleConfirm(toolUseId: string, decision: "confirm" | "decline") {
    startTransition(async () => {
      try {
        apply(await confirmAction(toolUseId, decision));
      } catch (err) {
        console.error("[asistente] no se pudo confirmar", err);
        showError();
      }
    });
  }

  async function handleRestart() {
    const ok = await confirm(restartText, { confirmLabel: "Borrar historial", danger: true });
    if (!ok) return;
    startTransition(async () => {
      try {
        apply(await restart());
      } catch (err) {
        console.error("[asistente] no se pudo reiniciar", err);
        showError();
      }
    });
  }

  const currentIndex = profile ? profile.items.findIndex((i) => i.current) : -1;
  const stepIndex = currentIndex >= 0 ? currentIndex : profile ? profile.items.findIndex((i) => !i.done) : -1;
  const step = profile && stepIndex >= 0 ? profile.items[stepIndex] : null;
  const stepLabel = profile && step ? `Paso ${stepIndex + 1} de ${profile.total} · ${step.label}` : null;
  const canWrite = aiConfigured && !lastPending && !isPending && voice.state !== "transcribing";
  const empty = loaded && !loadError && messages.length === 0 && !optimisticMessage;

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col bg-white" {...dropHandlers}>
      {fileViewer.viewer}
      {dropOverlay}
      <header className="flex items-center justify-between gap-2 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar name={botName} avatarUrl={botAvatarUrl} size="h-9 w-9 text-xs" />
          <div className="min-w-0 leading-tight">
            <p className="truncate font-display text-base font-semibold tracking-[-0.02em] text-slate-900">{botName}</p>
            <p className="truncate text-sm text-slate-500">{subtitle}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {messages.length > 0 && (
            <button type="button" onClick={handleRestart} disabled={isPending} className="flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-700 hover:border-red-300 hover:text-red-700 disabled:opacity-60">
              <TrashIcon className="h-4 w-4" />
              <span className="max-sm:sr-only">Borrar historial</span>
            </button>
          )}
          <button type="button" onClick={() => router.push(exitHref)} className="ml-1 flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3.5 py-1.5 text-sm font-semibold text-slate-800 hover:border-[#0a6b78] hover:bg-slate-50">
            <XIcon className="h-4 w-4" />
            Salir
          </button>
        </div>
      </header>
      {profile && <ProgressBar covered={profile.covered} total={profile.total} />}

      {profile && (
        <div className="relative border-b border-slate-100 lg:hidden">
          <button type="button" onClick={() => setTopicsOpen((v) => !v)} aria-expanded={topicsOpen} className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-[15px] text-slate-700">
            <span className="truncate">{stepLabel ?? `${profile.covered} de ${profile.total}`}</span>
            <span aria-hidden="true" className={`text-slate-400 transition-transform ${topicsOpen ? "rotate-180" : ""}`}>
              ▾
            </span>
          </button>
          {topicsOpen && (
            <div className="absolute inset-x-0 top-full z-20 max-h-[65vh] overflow-y-auto overflow-x-hidden border-b border-slate-100 bg-white p-4 shadow-[0_12px_32px_rgba(7,59,76,0.13)]">
              <Steps steps={profile} />
            </div>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {profile && (
          <aside className="hidden w-80 shrink-0 overflow-y-auto overflow-x-hidden border-r border-slate-100 bg-slate-50/60 px-6 py-6 lg:block">
            <p className="mb-5 font-display text-sm font-semibold tracking-[-0.02em] text-slate-700">
              {profile.covered} de {profile.total}
            </p>
            <Steps steps={profile} />
          </aside>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <div
            ref={scrollRef}
            onScroll={onScroll}
            className="flex-1 overflow-y-auto overflow-x-hidden"
          >
            {empty ? (
              <div className="flex min-h-full flex-col items-center justify-center gap-6 px-4 py-10 text-center">
                <Avatar name={botName} avatarUrl={botAvatarUrl} size="h-20 w-20 text-xl" />
                <div className="max-w-xl space-y-3">
                  <h1 className="font-display text-3xl font-semibold tracking-[-0.02em] text-slate-900 sm:text-4xl">{introTitle}</h1>
                  {introText && <p className="text-[17px] leading-relaxed text-slate-600">{introText}</p>}
                </div>
                <ul className="grid w-full max-w-2xl gap-3 text-left sm:grid-cols-3">
                  {[
                    { icon: <MicIcon className="h-5 w-5" />, text: "Escribir o grabar un audio" },
                    { icon: <PaperclipIcon className="h-5 w-5" />, text: introDocs },
                    { icon: <CheckIcon className="h-5 w-5" />, text: "Se guarda solo y se retoma después" },
                  ].map((card) => (
                    <li key={card.text} className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-4 text-[15px] leading-snug text-slate-700 sm:flex-col">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[#0a6b78]">{card.icon}</span>
                      {card.text}
                    </li>
                  ))}
                </ul>
                {aiConfigured ? (
                  <button type="button" onClick={() => send(startText || START_TEXT)} disabled={isPending} className="rounded-full bg-[#073b4c] px-7 py-3 text-base font-semibold text-white shadow-[0_12px_32px_rgba(7,59,76,0.13)] hover:bg-[#0a6b78] disabled:opacity-60">
                    Empezar
                  </button>
                ) : (
                  <p className="text-base text-slate-600">Falta conectar un servicio de IA en Configuración → Bot</p>
                )}
              </div>
            ) : (
              <div className="mx-auto max-w-3xl space-y-7 px-4 py-8 sm:px-6">
                {!loaded && <p className="text-base text-slate-400">Cargando…</p>}
                {loadError && <p className="text-base text-red-600">No se pudo cargar el asistente. Intentarlo de nuevo en un momento.</p>}
                <AssistantTurns
                  messages={messages}
                  optimisticMessage={optimisticMessage}
                  isPending={isPending}
                  botName={botName}
                  botAvatarUrl={botAvatarUrl}
                  openFile={fileViewer.open}
                  onConfirm={handleConfirm}
                  stepLabel={stepLabel}
                />
              </div>
            )}
          </div>

          {!empty && (
            <footer className="px-4 pt-2 pb-4 sm:px-6 sm:pb-6">
              <div className="mx-auto max-w-3xl">
                <AssistantComposer
                  text={text}
                  setText={setText}
                  onSend={() => send(text)}
                  canWrite={canWrite}
                  hasAttachments={attached.length > 0}
                  openPicker={openPicker}
                  fileInput={fileInput}
                  chips={chips}
                  voice={voice}
                  placeholder="Escribir la respuesta…"
                  blockedNotice={lastPending ? "Confirmar o cancelar la propuesta de arriba primero." : null}
                />
              </div>
            </footer>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
