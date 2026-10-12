"use client";

import { useEffect, useState } from "react";
import { useRouter } from "@/lib/useAppRouter";
import { useConfirm } from "@/components/Confirm";
import { useModalClose } from "@/components/Modal";
import { SearchableSelect } from "@/components/SearchableSelect";
import { useToast } from "@/components/Toast";
import { deleteUserPermanentlyAction, getUserDeletionSummaryAction } from "./actions";

type Summary = { pmProjects: number; activeTasks: number; credentials: number };

const KEEP = "none";

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function DeleteUserForm({ userId, name, people }: { userId: string; name: string; people: { id: string; label: string }[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const showToast = useToast();
  const close = useModalClose();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newPmId, setNewPmId] = useState("");
  const [tasksToId, setTasksToId] = useState(KEEP);
  const [credentialsToId, setCredentialsToId] = useState(KEEP);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let alive = true;
    getUserDeletionSummaryAction(userId)
      .then((result) => {
        if (!alive) return;
        if (result.ok) setSummary(result.summary);
        else setError(result.error);
      })
      .catch(() => {
        if (alive) setError("No se pudo consultar la información de esta persona.");
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  const withKeep = [{ id: KEEP, label: "No reasignar" }, ...people];
  const missingPm = Boolean(summary && summary.pmProjects > 0 && !newPmId);

  async function handleDelete() {
    const ok = await confirm(`¿Eliminar definitivamente a «${name}»? Se borran sus datos y accesos. Esta acción no se puede deshacer.`, {
      confirmLabel: "Eliminar definitivamente",
      danger: true,
    });
    if (!ok) return;
    setPending(true);
    setError(null);
    try {
      const result = await deleteUserPermanentlyAction({
        userId,
        newPmId: newPmId || null,
        tasksToId: tasksToId === KEEP ? null : tasksToId,
        credentialsToId: credentialsToId === KEEP ? null : credentialsToId,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      showToast(`Se eliminó definitivamente a ${name}.`, "success");
      close();
      router.refresh();
    } catch {
      setError("No se pudo eliminar a esta persona. Nada cambió.");
    } finally {
      setPending(false);
    }
  }

  if (!summary) return <p className="text-sm text-slate-500">{error ?? "Consultando…"}</p>;

  return (
    <div className="space-y-4 text-sm">
      <p className="text-slate-600">
        Se borran el nombre, el usuario, el correo, el teléfono, la foto y la clave de esta persona, y se cierran todos sus accesos. Lo que dejó en los proyectos se
        conserva, firmado «Usuario eliminado».
      </p>
      <ul className="flex flex-wrap gap-2 text-xs font-medium text-slate-600">
        <li className="rounded-md bg-slate-100 px-2 py-1">{count(summary.pmProjects, "proyecto como PM", "proyectos como PM")}</li>
        <li className="rounded-md bg-slate-100 px-2 py-1">{count(summary.activeTasks, "tarea vigente", "tareas vigentes")}</li>
        <li className="rounded-md bg-slate-100 px-2 py-1">{count(summary.credentials, "contraseña", "contraseñas")}</li>
      </ul>

      {summary.pmProjects > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-slate-600">Nuevo PM de sus proyectos</p>
          <SearchableSelect name="newPmId" options={people} placeholder="Elegir persona…" onChange={setNewPmId} />
        </div>
      )}
      {summary.activeTasks > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-slate-600">Sus tareas vigentes pasan a</p>
          <SearchableSelect name="tasksToId" options={withKeep} defaultValue={KEEP} onChange={setTasksToId} />
        </div>
      )}
      {summary.credentials > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-slate-600">Sus contraseñas pasan a</p>
          <SearchableSelect name="credentialsToId" options={withKeep} defaultValue={KEEP} onChange={setCredentialsToId} />
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || missingPm}
          onClick={handleDelete}
          className="cursor-pointer rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-default disabled:opacity-50"
        >
          {pending ? "Eliminando…" : "Eliminar definitivamente"}
        </button>
        <button type="button" disabled={pending} onClick={close} className="cursor-pointer rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Cancelar
        </button>
      </div>
    </div>
  );
}
