"use client";

import Link from "next/link";
import { ReferencePopover } from "@/components/ReferencePopover";
import { toolbarButtonClass } from "@/components/ToolbarButton";
import { TaskIcon } from "@/components/icons";

type Place = { href: string; title: string };

/**
 * Botón «Ver tarea» de los visores (imagen y documento). Si el archivo se usa
 * en varios lugares (vista Archivos, spec 001), abre la lista de todos en vez
 * de ir a uno solo; el número indica cuántos son.
 */
export function TaskLinkButton({ taskLink, usedIn }: { taskLink?: Place; usedIn?: Place[] }) {
  if (usedIn && usedIn.length > 1) {
    return (
      <ReferencePopover
        align="right"
        hoverText={`Usado en ${usedIn.length} lugares`}
        items={usedIn.map((l) => ({ id: l.href + l.title, label: l.title, href: l.href }))}
        trigger={
          <span className={`relative ${toolbarButtonClass()}`} aria-label={`Ver las ${usedIn.length} tareas donde se usa`}>
            <TaskIcon className="h-4 w-4" />
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#0a6b78] px-1 text-[10px] font-bold leading-none text-white">
              {usedIn.length}
            </span>
          </span>
        }
      />
    );
  }
  if (!taskLink) return null;
  return (
    <Link href={taskLink.href} title="Ver tarea" aria-label="Ver tarea" className={toolbarButtonClass()}>
      <TaskIcon className="h-4 w-4" />
    </Link>
  );
}
