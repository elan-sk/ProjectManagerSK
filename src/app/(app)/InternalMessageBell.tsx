"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { markInternalMessageRead } from "./internalMessageActions";
import { MessageIcon } from "@/components/icons";
import { commentPreview } from "@/lib/commentBody";

export function InternalMessageBell({ items }: { items: { id: string; body: string; projectId: string; taskId: string | null; author: string; mentioned?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Igual que NotificationBell: clic afuera (o Escape) cierra el desplegable.
  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!items.length) return null;
  return <div ref={containerRef} className="relative"><button onClick={() => setOpen(!open)} className="relative rounded-lg p-1.5 text-white/90 transition-colors hover:bg-white/15 hover:text-white" aria-label="Comentarios internos nuevos"><MessageIcon className="h-5 w-5" /><span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">{items.length}</span></button>{open && <div className="pacific-popover absolute right-0 z-10 mt-2 w-80 rounded-xl bg-white p-2 shadow-[0_16px_40px_rgba(15,23,42,.12)]">{items.map((m) => <Link key={m.id} onClick={() => { void markInternalMessageRead(m.id); setOpen(false); }} href={m.taskId ? `/projects/${m.projectId}/tasks/${m.taskId}#internal-conversation` : `/projects/${m.projectId}?view=conversation#internal-conversation`} className="block rounded-lg p-2 text-sm hover:bg-slate-50"><b>{m.author}</b>{m.mentioned && <span className="ml-1 rounded bg-[#0a6b78]/10 px-1 text-[10px] font-medium text-[#0a6b78]">te mencionó</span>}<p className="truncate text-slate-600">{commentPreview(m.body)}</p></Link>)}</div>}</div>;
}
