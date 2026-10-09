"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "@/lib/useAppRouter";
import { Avatar } from "@/components/Avatar";
import { useConfirm } from "@/components/Confirm";
import { ModalTrigger, useModalClose } from "@/components/Modal";
import { ProjectIcon } from "@/components/ProjectIcon";
import { DEFINITION_ACTION_BTN, DEFINITION_ACTION_BTN_DANGER } from "@/lib/statusColors";
import { CreateProjectForm } from "../CreateProjectForm";
import { setProjectParent } from "./subprojectActions";

type Sub = { id: string; name: string; iconUrl: string | null; pmName: string; pmAvatarUrl: string | null; pct: number };

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
              <div className="flex flex-shrink-0 items-center gap-1.5">
                <div className="h-1.5 w-16 overflow-hidden bg-slate-100">
                  <div className="progress-fill-emerald h-full" style={{ width: `${s.pct}%` }} />
                </div>
                <span className="w-9 text-right text-xs text-slate-500">{s.pct}%</span>
              </div>
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
