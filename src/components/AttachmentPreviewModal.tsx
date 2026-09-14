"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useConfirm } from "@/components/Confirm";

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

export function isPreviewable(mimeType: string) {
  return mimeType === PDF_MIME || mimeType === WORD_MIME || mimeType === EXCEL_MIME;
}

function tabClass(active: boolean) {
  return `rounded-lg px-2.5 py-1 text-xs ${active ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`;
}

/**
 * Visor simple para PDF (renderer nativo del navegador vía <iframe>), Word
 * (docx-preview) y Excel (exceljs, armamos una tabla HTML nosotros) — las
 * tres carga cliente-only con dynamic import, sin depender de ningún
 * servicio externo. Word/Excel legacy (.doc/.xls binarios) y PowerPoint
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
  const containerRef = useRef<HTMLDivElement>(null);
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(file.mimeType !== PDF_MIME);
  const [error, setError] = useState<string | null>(null);
  const [sheets, setSheets] = useState<{ name: string; rows: string[][] }[] | null>(null);
  const [activeSheet, setActiveSheet] = useState(0);

  useEffect(() => {
    if (file.mimeType === PDF_MIME) return; // el iframe se encarga solo
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      setSheets(null);
      try {
        if (file.mimeType === WORD_MIME) {
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
  }, [file.mimeType, file.url]);

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/60" />
      <div className="relative flex h-[90vh] w-full max-w-5xl flex-col gap-3" onClick={(e) => e.stopPropagation()}>
        {file.mimeType === PDF_MIME && (
          <iframe src={file.url} title={file.name} className="min-h-0 flex-1 rounded-xl border-0 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.3)]" />
        )}

        {file.mimeType !== PDF_MIME && (
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

            {file.mimeType === WORD_MIME && <div className="min-h-0 flex-1 overflow-auto" ref={containerRef} />}
          </div>
        )}

        <div className="flex w-full flex-shrink-0 flex-wrap items-center justify-between gap-3 rounded-xl bg-white px-4 py-2">
          <span className="min-w-0 truncate text-sm text-slate-700">{file.name}</span>
          <div className="flex flex-shrink-0 flex-wrap items-center gap-3">
            {file.mimeType === PDF_MIME && (
              <a href={file.url} target="_blank" rel="noreferrer" className="text-sm font-medium text-slate-900 hover:underline">
                Abrir en pestaña
              </a>
            )}
            <a href={file.url} download={file.name} className="text-sm font-medium text-slate-900 hover:underline">
              Descargar
            </a>
            {file.taskLink && (
              <Link href={file.taskLink.href} className="text-sm font-medium text-slate-900 hover:underline">
                Ver tarea
              </Link>
            )}
            {onDelete && (
              <button type="button" onClick={handleDelete} disabled={deleting} className="text-sm font-medium text-red-600 hover:underline">
                Eliminar
              </button>
            )}
            <button type="button" onClick={onClose} className="text-sm text-slate-500 hover:text-slate-900">
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
