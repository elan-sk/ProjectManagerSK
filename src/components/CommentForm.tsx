"use client";

import { BoldButton, boldOnKeyDown } from "@/components/BoldButton";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { postInternalMessage } from "@/app/(app)/internalMessageActions";
import { COMMENT_MAX_LENGTH, fileMarker, imageMarker, linkMarker, mentionMarker, splitCommentBody } from "@/lib/commentBody";
import { pastedImageName, pickPastedImage } from "@/lib/pasteImage";
import { normalizeSearchText } from "@/lib/search";
import { LinkIcon, PaperclipIcon } from "@/components/icons";
import { PollFields } from "@/app/(app)/projects/[id]/tasks/[taskId]/TeamShareThread";

export type MentionPerson = { id: string; name: string };

/**
 * Caja para escribir un comentario interno. Acepta texto, capturas pegadas
 * (Ctrl+V), archivos, enlaces y @menciones: al escribir «@» se despliega la
 * lista del equipo. Las capturas/archivos se suben a /uploads y se inserta en
 * el texto una marca con su ruta (ver commentBody.ts); las menciones se
 * escriben como «@Nombre» y se convierten en marca al enviar. Los archivos y
 * enlaces quedan además en los Insumos (ver internalMessageActions.ts).
 */
export function CommentForm({ projectId, taskId, people = [], reviewCheckId, allowPoll = false }: {
  projectId: string;
  taskId: string | null;
  people?: MentionPerson[];
  /** Hilo de una prueba (tarea tipo Prueba): el comentario cuelga de ese check. */
  reviewCheckId?: string;
  /** Permite publicar una pregunta de selección única o múltiple en vez de un comentario. */
  allowPoll?: boolean;
}) {
  const router = useRouter();
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(0);
  const [pending, startTransition] = useTransition();
  const [mentions, setMentions] = useState<MentionPerson[]>([]);
  const [query, setQuery] = useState<string | null>(null);
  // Persona resaltada en la lista de menciones (flechas ↑/↓, Enter o Tab para elegirla).
  const [active, setActive] = useState(0);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkName, setLinkName] = useState("");
  const [asPoll, setAsPoll] = useState(false);
  const [multiple, setMultiple] = useState(false);
  const [options, setOptions] = useState(["", ""]);

  const images = splitCommentBody(value).flatMap((p) => (p.type === "image" ? [p.url] : []));
  const suggestions =
    query === null ? [] : people.filter((p) => normalizeSearchText(p.name).includes(normalizeSearchText(query))).slice(0, 6);

  function insert(marker: string, start?: number, end?: number) {
    const el = areaRef.current;
    const s = start ?? el?.selectionStart ?? value.length;
    const e = end ?? el?.selectionEnd ?? s;
    setValue((v) => v.slice(0, s) + marker + v.slice(e));
  }

  async function upload(file: File) {
    const el = areaRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? start;
    setUploading((n) => n + 1);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "No se pudo subir el archivo.");
      insert(body.mimeType?.startsWith("image/") ? imageMarker(body.url) : fileMarker(body.url, body.name), start, end);
    } catch (err) {
      setError((err as Error).message || "No se pudo subir el archivo.");
    } finally {
      setUploading((n) => n - 1);
    }
  }

  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const image = pickPastedImage(Array.from(e.clipboardData.files));
    // Si el portapapeles trae texto (ej. celdas de Excel), gana el pegado normal.
    if (!image || e.clipboardData.getData("text/plain").trim() !== "") return;
    // preventDefault también le avisa a usePasteImage (áreas de subida) que ya se atendió.
    e.preventDefault();
    void upload(new File([image], pastedImageName(image.type), { type: image.type }));
  }

  function onChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setValue(e.target.value);
    // «@» seguido de letras justo antes del cursor abre la lista de menciones.
    const before = e.target.value.slice(0, e.target.selectionStart);
    const match = /(?:^|\s)@([^\s@]*)$/.exec(before);
    setQuery(match && people.length > 0 ? match[1] : null);
    setActive(0);
  }

  function pick(person: MentionPerson) {
    const el = areaRef.current;
    const caret = el?.selectionStart ?? value.length;
    const before = value.slice(0, caret).replace(/@([^\s@]*)$/, `@${person.name} `);
    setValue(before + value.slice(caret));
    setMentions((m) => (m.some((x) => x.id === person.id) ? m : [...m, person]));
    setQuery(null);
    requestAnimationFrame(() => el?.focus());
  }

  function addLink() {
    try {
      const url = new URL(linkUrl.trim());
      if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
      insert(linkMarker(url.toString(), linkName.trim() || url.hostname));
      setLinkOpen(false);
      setLinkUrl("");
      setLinkName("");
      setError(null);
    } catch {
      setError("Ese enlace no parece válido — escribí la dirección completa, con https://");
    }
  }

  function submit() {
    setError(null);
    // «@Nombre» → marca con el id de la persona (de más largo a más corto para no pisar nombres parecidos).
    const text = [...mentions]
      .sort((a, b) => b.name.length - a.name.length)
      .reduce((acc, m) => acc.split(`@${m.name}`).join(mentionMarker(m.id, m.name)), value);
    startTransition(async () => {
      const result = await postInternalMessage(
        projectId,
        taskId,
        text,
        reviewCheckId || asPoll ? { reviewCheckId, poll: asPoll ? { multiple, options } : undefined } : undefined
      );
      if (result.ok) {
        setValue("");
        setMentions([]);
        setAsPoll(false);
        setMultiple(false);
        setOptions(["", ""]);
        router.refresh();
      } else {
        setError(result.error ?? "No se pudo enviar el comentario.");
      }
    });
  }

  const busy = pending || uploading > 0;
  const pollReady = !asPoll || options.map((o) => o.trim()).filter(Boolean).length >= 2;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy && value.trim() && pollReady) submit();
      }}
      className="space-y-1.5"
    >
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1 rounded-lg border border-slate-300 bg-white transition focus-within:border-[#0a6b78] focus-within:ring-2 focus-within:ring-[#0a6b78]/40">
          <textarea
            ref={areaRef}
            value={value}
            onChange={onChange}
            onKeyDown={(e) => {
              if (boldOnKeyDown(e)) return;
              if (e.key === "Escape") setQuery(null);
              if (suggestions.length > 0) {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((a) => (a + (e.key === "ArrowDown" ? 1 : -1) + suggestions.length) % suggestions.length);
                } else if ((e.key === "Enter" && !e.shiftKey) || e.key === "Tab") {
                  e.preventDefault();
                  pick(suggestions[Math.min(active, suggestions.length - 1)]);
                }
              }
            }}
            onPaste={onPaste}
            maxLength={COMMENT_MAX_LENGTH}
            placeholder={asPoll ? "Enunciado de la pregunta… (@ para mencionar)" : "Escribir comentario interno… (@ para mencionar)"}
            aria-label="Comentario interno"
            className="block min-h-10 w-full resize-y rounded-lg bg-transparent px-3 py-2 text-sm outline-none"
          />
          {suggestions.length > 0 && (
            <ul role="listbox" aria-label="Personas del equipo" className="absolute bottom-full left-0 z-20 mb-1 max-h-48 w-60 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
              {suggestions.map((p, i) => (
                <li key={p.id} ref={i === active ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}>
                  <button type="button" role="option" aria-selected={i === active} onMouseDown={(e) => { e.preventDefault(); pick(p); }} onMouseEnter={() => setActive(i)} className={`block w-full cursor-pointer rounded px-2 py-1.5 text-left text-sm text-slate-700 ${i === active ? "bg-[#0a6b78]/15 font-medium" : "hover:bg-slate-100"}`}>
                    @{p.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center gap-1 border-t border-slate-100 px-2 py-1">
            <button type="button" onClick={() => fileRef.current?.click()} title="Adjuntar archivo" aria-label="Adjuntar archivo" className="cursor-pointer rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <PaperclipIcon className="h-4 w-4" />
            </button>
            <BoldButton targetRef={areaRef} />
            <button type="button" onClick={() => setLinkOpen((v) => !v)} title="Agregar enlace" aria-label="Agregar enlace" className="cursor-pointer rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <LinkIcon className="h-4 w-4" />
            </button>
            {allowPoll && (
              <button type="button" onClick={() => setAsPoll((v) => !v)} className="ml-auto cursor-pointer rounded px-2 py-0.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800">
                {asPoll ? "Volver a comentario" : "Hacer una pregunta"}
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file);
                e.target.value = "";
              }}
            />
          </div>
        </div>
        <button
          disabled={busy || !value.trim() || !pollReady}
          className="self-end rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? "Enviando…" : asPoll ? "Publicar pregunta" : "Enviar"}
        </button>
      </div>

      {asPoll && <PollFields multiple={multiple} setMultiple={setMultiple} options={options} setOptions={setOptions} />}

      {linkOpen && (
        <div className="flex flex-wrap items-center gap-2">
          <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="URL (https://…)" aria-label="URL del enlace" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1 text-sm" />
          <input value={linkName} onChange={(e) => setLinkName(e.target.value)} placeholder="Nombre" aria-label="Nombre del enlace" className="w-40 rounded-lg border border-slate-300 px-2 py-1 text-sm" />
          <button type="button" onClick={addLink} disabled={!linkUrl.trim()} className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            Agregar
          </button>
        </div>
      )}
      {uploading > 0 && <p className="text-xs text-slate-400">Subiendo archivo…</p>}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((url) => (
            <figure key={url} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="Captura adjunta" className="h-16 w-auto max-w-40 rounded-lg border border-slate-200 object-cover" />
              <button
                type="button"
                onClick={() => setValue((v) => v.replace(imageMarker(url), ""))}
                aria-label="Quitar captura"
                className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-xs text-white"
              >
                ×
              </button>
            </figure>
          ))}
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  );
}
