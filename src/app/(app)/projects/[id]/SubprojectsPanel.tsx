"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "@/lib/useAppRouter";
import { Avatar } from "@/components/Avatar";
import { useConfirm } from "@/components/Confirm";
import { ModalTrigger, useModalClose } from "@/components/Modal";
import { ProjectIcon, ProjectIconGroup } from "@/components/ProjectIcon";
import { ReferencePopover } from "@/components/ReferencePopover";
import { DEFINITION_ACTION_BTN, DEFINITION_ACTION_BTN_DANGER } from "@/lib/statusColors";
import { CreateProjectForm } from "../CreateProjectForm";
import { setProjectParent } from "./subprojectActions";

export type SubprojectSummary = { id: string; name: string; iconUrl: string | null; pmName: string; pmAvatarUrl: string | null; pct: number };
type Sub = SubprojectSummary;

// Spec 004: bloque «Subproyectos» de la Definición — compacto a propósito (RF-9).
// En un subproyecto se reduce a «Subproyecto de <principal>».
export function SubprojectsPanel({
  projectId,
  parent,
  subprojects,
  canManage,
  linkable,
  users,
}: {
  projectId: string;
  parent: { id: string; name: string; iconUrl: string | null } | null;
  subprojects: Sub[];
  canManage: boolean;
  linkable: { id: string; name: string }[];
  users: { id: string; name: string }[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (parent) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[17px] text-slate-600">
        <span>Subproyecto de</span>
        <ProjectIcon name={parent.name} iconUrl={parent.iconUrl} size="h-5 w-5 text-[9px]" />
        <Link href={`/projects/${parent.id}`} className="font-medium text-slate-900 hover:underline">
          {parent.name}
        </Link>
      </div>
    );
  }
  if (!canManage && subprojects.length === 0) return null;

  async function handleUnlink(sub: Sub) {
    const ok = await confirm(`¿Quitar «${sub.name}» del grupo? Seguirá como proyecto independiente, sin perder nada.`, { confirmLabel: "Quitar del grupo" });
    if (!ok) return;
    setError(null);
    startTransition(async () => {
      const result = await setProjectParent(sub.id, null);
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[21px] font-semibold text-slate-900">Subproyectos</h2>
        {canManage && (
          <div className="flex gap-2">
            <ModalTrigger label="+ Nuevo subproyecto" title="Nuevo subproyecto" variant="secondary" compact className={DEFINITION_ACTION_BTN}>
              <CreateProjectForm users={users} parentId={projectId} />
            </ModalTrigger>
            {linkable.length > 0 && (
              <ModalTrigger label="Vincular existente" title="Vincular un proyecto existente" variant="secondary" compact className={DEFINITION_ACTION_BTN}>
                <LinkExistingForm projectId={projectId} linkable={linkable} />
              </ModalTrigger>
            )}
          </div>
        )}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {subprojects.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {subprojects.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-2">
              <Link href={`/projects/${s.id}`} className="flex min-w-0 flex-1 items-center gap-2">
                <ProjectIcon name={s.name} iconUrl={s.iconUrl} size="h-7 w-7 text-[11px]" />
                <span className="truncate font-medium text-slate-900 hover:underline">{s.name}</span>
              </Link>
              <Avatar name={s.pmName} avatarUrl={s.pmAvatarUrl} size="h-6 w-6 text-[10px]" />
              <SubprojectProgress pct={s.pct} />
              {canManage && (
                <button type="button" disabled={isPending} onClick={() => handleUnlink(s)} className={DEFINITION_ACTION_BTN_DANGER}>
                  Quitar del grupo
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Grupito de logos de subproyectos que, al hacer clic, abre un popup con la misma fila de la lista
 * «Subproyectos» (ícono, nombre, PM y avance); cada fila lleva a su subproyecto. Funciona dentro de
 * tarjetas que ya son un link (ReferencePopover). `trigger` reemplaza al grupito (ej. píldora «Grupo»).
 */
export function SubprojectsPopover({ subprojects, size, max, trigger }: { subprojects: Sub[]; size?: string; max?: number; trigger?: React.ReactNode }) {
  if (subprojects.length === 0) return null;
  return (
    <ReferencePopover
      trigger={trigger ?? <ProjectIconGroup projects={subprojects} size={size} max={max} />}
      hoverText="Ver subproyectos"
      width={380}
      items={subprojects.map((s) => ({
        id: s.id,
        label: s.name,
        href: `/projects/${s.id}`,
        content: (
          <span className="flex items-center gap-2">
            <IconWithPm sub={s} />
            <span className="min-w-0 flex-1 truncate font-medium text-slate-900">{s.name}</span>
            <SubprojectProgress pct={s.pct} />
          </span>
        ),
      }))}
    />
  );
}

/** Popup de subproyectos: ícono con el avatar de su PM encimado (la lista de la Definición lo deja a la derecha). */
function IconWithPm({ sub }: { sub: Sub }) {
  return (
    <span className="relative mr-2 mb-1.5 inline-flex shrink-0" title={`PM: ${sub.pmName}`}>
      <ProjectIcon name={sub.name} iconUrl={sub.iconUrl} size="h-7 w-7 text-[11px]" />
      <span className="absolute -right-2 -bottom-1.5 rounded-full ring-2 ring-white">
        <Avatar name={sub.pmName} avatarUrl={sub.pmAvatarUrl} size="h-5 w-5 text-[8px]" />
      </span>
    </span>
  );
}

/** Barra + % de avance de un subproyecto (lista de la Definición y popup de la tarjeta del principal). */
export function SubprojectProgress({ pct }: { pct: number }) {
  return (
    <span className="flex flex-shrink-0 items-center gap-1.5">
      <span className="block h-1.5 w-16 overflow-hidden bg-slate-100">
        <span className="progress-fill-emerald block h-full" style={{ width: `${pct}%` }} />
      </span>
      <span className="w-9 text-right text-xs text-slate-500">{pct}%</span>
    </span>
  );
}

function LinkExistingForm({ projectId, linkable }: { projectId: string; linkable: { id: string; name: string }[] }) {
  const router = useRouter();
  const onDone = useModalClose();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  return (
    <form
      action={(formData: FormData) => {
        setError(null);
        startTransition(async () => {
          const result = await setProjectParent(String(formData.get("childId")), projectId);
          if (result.ok) {
            onDone();
            router.refresh();
          } else setError(result.error);
        });
      }}
      className="space-y-3"
    >
      <div className="space-y-1">
        <label className="text-sm text-slate-600">Proyecto</label>
        <select name="childId" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
          {linkable.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button disabled={isPending} className="w-full rounded-lg bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">
        {isPending ? "Vinculando…" : "Vincular como subproyecto"}
      </button>
    </form>
  );
}
