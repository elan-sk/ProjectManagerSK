"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useConfirm } from "@/components/Confirm";
import { HTML_SANDBOX } from "@/lib/htmlShell";
import { ToolbarButton, toolbarButtonClass } from "@/components/ToolbarButton";
import { CheckIcon, CopyIcon, DownloadIcon, ExpandIcon, ExternalLinkIcon, TaskIcon, TrashIcon, XIcon } from "@/components/icons";

export type PreviewFile = {
  id: string;
  url: string;
  name: string;
  mimeType: string;
  taskLink?: { href: string; title: string };
};

const WORD_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const EXCEL_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PDF_MIME = "application/pdf";
const HTML_MIME = "text/html";
const TEXT_MIME = "text/plain";
const CSV_MIME = "text/csv";
const MARKDOWN_MIME = "text/markdown";

export function isPreviewable(mimeType: string) {
  return [PDF_MIME, HTML_MIME, WORD_MIME, EXCEL_MIME, TEXT_MIME, CSV_MIME, MARKDOWN_MIME].includes(mimeType);
}

// Documento para el <iframe srcDoc> del Markdown. El .md puede traer HTML
// crudo: por eso se muestra en un iframe con sandbox SIN allow-scripts ni
// allow-same-origin (no ejecuta nada ni toca la app), en vez de sanitizar.
// Los links abren en pestaña nueva (base target + allow-popups).
function markdownDocument(html: string) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><base target="_blank"><style>
body{font:15px/1.6 system-ui,sans-serif;color:#1e293b;max-width:860px;margin:0 auto;padding:8px 20px 40px}
h1,h2,h3,h4{line-height:1.25;margin:1.4em 0 .5em}h1{font-size:1.7em}h2{font-size:1.35em;border-bottom:1px solid #e2e8f0;padding-bottom:.25em}h3{font-size:1.1em}
a{color:#2563eb}code{background:#f1f5f9;border-radius:4px;padding:.1em .35em;font-size:.9em}
pre{background:#f1f5f9;border-radius:8px;padding:12px;overflow:auto}pre code{background:none;padding:0}
table{border-collapse:collapse;margin:1em 0;font-size:.92em}th,td{border:1px solid #cbd5e1;padding:6px 10px;text-align:left;vertical-align:top}th{background:#f8fafc}
blockquote{margin:1em 0;padding:.2em 1em;border-left:4px solid #cbd5e1;color:#475569}img{max-width:100%}hr{border:0;border-top:1px solid #e2e8f0}
</style></head><body>${html}</body></html>`;
}

// CSV a filas: comillas dobles (con "" escapado y saltos de línea adentro) y
// separador "," o ";" (el que más aparezca en la primera línea — Excel en
// español exporta con ";").
export function parseCsv(text: string): string[][] {
  const firstLine = text.split("\n", 1)[0];
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows;
}

function tabClass(active: boolean) {
  return `rounded-lg px-2.5 py-1 text-xs ${active ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`;
}

/**
 * Visor simple para PDF (renderer nativo del navegador vía <iframe>), Word
 * (docx-preview) y Excel (exceljs, armamos una tabla HTML nosotros) — las
 * tres carga cliente-only con dynamic import, sin depender de ningún
 * servicio externo. Texto (.txt) se muestra tal cual, CSV como la misma
 * tabla de Excel y Markdown (.md) con formato (marked, en iframe sin scripts). Word/Excel legacy (.doc/.xls binarios) y PowerPoint
 * quedan fuera (sin una librería cliente simple y confiable) — siguen
 * descargándose como antes.
 *
 * Componente compartido: vive en src/components porque lo usan dos flujos
 * de borrado distintos (adjuntos de tarea vs. archivos generales del
 * proyecto en Definición) — por eso `onDelete` es un callback, no una
 * server action hardcodeada; el que llama decide qué borrar.
 */
export function AttachmentPreviewModal({
  file,
  onClose,
  onDelete,
}: {
  file: PreviewFile;
  onClose: () => void;
  /** Si se pasa, se muestra el botón "Eliminar" y este callback hace el borrado real + refresh. */
  onDelete?: () => Promise<void>;
}) {
  const confirm = useConfirm();
  const isFrame = file.mimeType === PDF_MIME || file.mimeType === HTML_MIME;
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(!isFrame);
  const [error, setError] = useState<string | null>(null);
  const [sheets, setSheets] = useState<{ name: string; rows: string[][] }[] | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [markdownDoc, setMarkdownDoc] = useState<string | null>(null);
  const [activeSheet, setActiveSheet] = useState(0);

  useEffect(() => {
    if (isFrame) return; // el iframe se encarga solo
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      setSheets(null);
      setText(null);
      setMarkdownDoc(null);
      try {
        if (file.mimeType === MARKDOWN_MIME) {
          const [{ marked }, res] = await Promise.all([import("marked"), fetch(file.url)]);
          if (res.status === 404) throw new Error("NOT_FOUND");
          if (!res.ok) throw new Error("FETCH_FAILED");
          const html = await marked.parse(await res.text());
          if (cancelled) return;
          setMarkdownDoc(markdownDocument(html));
        } else if (file.mimeType === TEXT_MIME || file.mimeType === CSV_MIME) {
          const res = await fetch(file.url);
          if (res.status === 404) throw new Error("NOT_FOUND");
          if (!res.ok) throw new Error("FETCH_FAILED");
          const body = await res.text();
          if (cancelled) return;
          if (file.mimeType === CSV_MIME) setSheets([{ name: file.name, rows: parseCsv(body) }]);
          else setText(body);
        } else if (file.mimeType === WORD_MIME) {
          const [{ renderAsync }, res] = await Promise.all([import("docx-preview"), fetch(file.url)]);
          // Sin este chequeo, un 404 (archivo borrado/perdido del servidor)
          // se intentaba igual renderizar como si fuera el .docx real —
          // fallaba al parsear con el mismo mensaje genérico que cualquier
          // otro error, sin decir qué pasó de verdad.
          if (res.status === 404) throw new Error("NOT_FOUND");
          if (!res.ok) throw new Error("FETCH_FAILED");
          const blob = await res.blob();
          if (cancelled || !containerRef.current) return;
          containerRef.current.innerHTML = "";
          await renderAsync(blob, containerRef.current);
        } else if (file.mimeType === EXCEL_MIME) {
          const [{ default: ExcelJS }, res] = await Promise.all([import("exceljs"), fetch(file.url)]);
          if (res.status === 404) throw new Error("NOT_FOUND");
          if (!res.ok) throw new Error("FETCH_FAILED");
          const buffer = await res.arrayBuffer();
          const workbook = new ExcelJS.Workbook();
          // El tipo de exceljs pide Buffer (Node); en el navegador funciona
          // igual pasándole el ArrayBuffer — típico gap de sus .d.ts, de ahí
          // el `any` puntual (no hay un cast estructural válido entre
          // ArrayBuffer y el Buffer<T> genérico de los tipos de Node).
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await workbook.xlsx.load(buffer as any);
          if (cancelled) return;
          setSheets(
            workbook.worksheets.map((ws) => {
              const rows: string[][] = [];
              ws.eachRow({ includeEmpty: true }, (row) => {
                const cells: string[] = [];
                row.eachCell({ includeEmpty: true }, (cell) => cells.push(cell.text ?? ""));
                rows.push(cells);
              });
              return { name: ws.name, rows };
            })
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error && err.message === "NOT_FOUND"
              ? "Este archivo ya no está disponible en el servidor."
              : "No se pudo mostrar este archivo — probá descargarlo."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [file.mimeType, file.url, file.name, isFrame]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function handleDelete() {
    if (!onDelete) return;
    const ok = await confirm(`¿Seguro que querés eliminar "${file.name}"? No vas a poder deshacer esto.`, {
      confirmLabel: "Eliminar",
      danger: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await onDelete();
      onClose();
    } finally {
      setDeleting(false);
    }
  }

  const currentSheet = sheets?.[activeSheet];
  const isHtml = file.mimeType === HTML_MIME;

  // Enlace absoluto del archivo (el origen solo se conoce en el navegador).
  function copyUrl() {
    const url = new URL(file.url, window.location.origin).href;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    // Márgenes chicos y sin límite de ancho fijo (solo un tope generoso en monitores muy anchos): aprovecha
    // casi toda la pantalla — un instructivo HTML se ve como una página, no como una ventanita en el medio.
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/60" />
      <div className="relative flex h-[97vh] w-full max-w-[1600px] flex-col gap-2" onClick={(e) => e.stopPropagation()}>
        {/* Barra arriba, no abajo: mismo lugar y mismos iconos que el visor incrustado del checklist (StepAttachments). */}
        <div className="flex w-full flex-shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-2 py-1 shadow-sm">
          <span className="min-w-0 truncate pl-1 text-xs text-slate-700">{file.name}</span>
          <div className="flex flex-shrink-0 items-center gap-0.5">
            {isHtml && (
              <>
                <ToolbarButton icon={<ExpandIcon className="h-4 w-4" />} label="Pantalla completa del navegador" onClick={() => frameRef.current?.requestFullscreen?.()} />
                <ToolbarButton icon={copied ? <CheckIcon className="h-4 w-4 text-emerald-600" /> : <CopyIcon className="h-4 w-4" />} label={copied ? "¡Enlace copiado!" : "Copiar enlace"} onClick={copyUrl} />
              </>
            )}
            {(file.mimeType === PDF_MIME || isHtml) && (
              <a href={file.url} target="_blank" rel="noreferrer" title="Abrir en pestaña" aria-label="Abrir en pestaña" className={toolbarButtonClass()}>
                <ExternalLinkIcon className="h-4 w-4" />
              </a>
            )}
            <a href={file.url} download={file.name} title="Descargar" aria-label="Descargar" className={toolbarButtonClass()}>
              <DownloadIcon className="h-4 w-4" />
            </a>
            {file.taskLink && (
              <Link href={file.taskLink.href} title="Ver tarea" aria-label="Ver tarea" className={toolbarButtonClass()}>
                <TaskIcon className="h-4 w-4" />
              </Link>
            )}
            {onDelete && (
              <ToolbarButton icon={<TrashIcon className="h-4 w-4" />} label="Eliminar" onClick={handleDelete} disabled={deleting} danger />
            )}
            <span className="mx-0.5 h-4 w-px bg-slate-200" aria-hidden />
            <ToolbarButton icon={<XIcon className="h-4 w-4" />} label="Cerrar" onClick={onClose} />
          </div>
        </div>

        {isFrame && (
          <iframe ref={frameRef} src={file.url} title={file.name} allowFullScreen sandbox={file.mimeType === HTML_MIME ? HTML_SANDBOX : undefined} className="min-h-0 flex-1 rounded-xl border-0 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.3)]" />
        )}

        {!isFrame && (
          <div className="flex min-h-0 flex-1 flex-col gap-2 rounded-xl bg-white p-4 shadow-[0_8px_30px_rgba(15,23,42,0.3)]">
            {loading && <p className="text-sm text-slate-400">Cargando…</p>}
            {error && <p className="text-sm text-red-600">{error}</p>}

            {sheets && sheets.length > 1 && (
              <div className="flex flex-shrink-0 flex-wrap gap-1.5">
                {sheets.map((s, i) => (
                  <button key={s.name} type="button" onClick={() => setActiveSheet(i)} className={tabClass(i === activeSheet)}>
                    {s.name}
                  </button>
                ))}
              </div>
            )}

            {currentSheet && (
              <div className="min-h-0 flex-1 overflow-auto">
                <table className="min-w-full border-collapse text-xs">
                  <tbody>
                    {currentSheet.rows.map((row, ri) => (
                      <tr key={ri}>
                        {row.map((cell, ci) => (
                          <td key={ci} className="whitespace-nowrap border border-slate-200 px-2 py-1">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {markdownDoc !== null && (
              <iframe
                srcDoc={markdownDoc}
                title={file.name}
                sandbox="allow-popups allow-popups-to-escape-sandbox"
                className="min-h-0 w-full flex-1 border-0"
              />
            )}

            {text !== null && (
              <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap wrap-break-word font-mono text-xs leading-relaxed text-slate-700">{text}</pre>
            )}

            {file.mimeType === WORD_MIME && <div className="min-h-0 flex-1 overflow-auto" ref={containerRef} />}
          </div>
        )}
      </div>
    </div>
  );
}
