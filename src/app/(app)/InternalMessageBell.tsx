"use client";
import { AnchoredPopover, useAnchoredPopover } from "@/components/AnchoredPopover";
import Link from "next/link";
import { markInternalMessageRead } from "./internalMessageActions";
import { MessageIcon } from "@/components/icons";
import { commentPreview } from "@/lib/commentBody";

export function InternalMessageBell({ items }: { items: { id: string; body: string; projectId: string; taskId: string | null; author: string; mentioned?: boolean }[] }) {
  const { anchorRef, panelRef, pos, toggle, close } = useAnchoredPopover(320);

  if (!items.length) return null;
  return <div ref={anchorRef} className="relative"><button onClick={toggle} className="relative rounded-full p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Comentarios internos nuevos"><MessageIcon className="h-5 w-5" /><span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">{items.length}</span></button><AnchoredPopover pos={pos} panelRef={panelRef}>{items.map((m) => <Link key={m.id} onClick={() => { void markInternalMessageRead(m.id); close(); }} href={m.taskId ? `/projects/${m.projectId}/tasks/${m.taskId}#internal-conversation` : `/projects/${m.projectId}?view=conversation#internal-conversation`} className="block rounded-lg p-2 text-sm hover:bg-slate-50"><b>{m.author}</b>{m.mentioned && <span className="ml-1 rounded bg-[#0a6b78]/10 px-1 text-[10px] font-medium text-[#0a6b78]">te mencionó</span>}<p className="truncate text-slate-600">{commentPreview(m.body)}</p></Link>)}</AnchoredPopover></div>;
}
