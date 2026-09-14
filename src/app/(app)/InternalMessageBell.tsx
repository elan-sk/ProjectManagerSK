"use client";
import { useState } from "react";
import Link from "next/link";
import { markInternalMessageRead } from "./internalMessageActions";
import { MessageIcon } from "@/components/icons";

export function InternalMessageBell({ items }: { items: { id: string; body: string; projectId: string; taskId: string | null; author: string }[] }) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  return <div className="relative"><button onClick={() => setOpen(!open)} className="relative rounded-lg p-1.5 text-white/90 transition-colors hover:bg-white/15 hover:text-white" aria-label="Comentarios internos nuevos"><MessageIcon className="h-5 w-5" /><span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">{items.length}</span></button>{open && <div className="pacific-popover absolute right-0 z-10 mt-2 w-80 rounded-xl bg-white p-2 shadow-[0_16px_40px_rgba(15,23,42,.12)]">{items.map((m) => <Link key={m.id} onClick={() => { void markInternalMessageRead(m.id); setOpen(false); }} href={m.taskId ? `/projects/${m.projectId}/tasks/${m.taskId}#internal-conversation` : `/projects/${m.projectId}?view=conversation#internal-conversation`} className="block rounded-lg p-2 text-sm hover:bg-slate-50"><b>{m.author}</b><p className="truncate text-slate-600">{m.body}</p></Link>)}</div>}</div>;
}
