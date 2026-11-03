"use client";

import { useEffect, useState, useTransition } from "react";
import { projectWhatsAppGroups, updateProjectWhatsAppGroup } from "./definitionActions";

// Grupo propio de WhatsApp para las alertas graves de este proyecto — si
// queda en "Usar el grupo por defecto", se resuelve al grupo global de
// Configuración (ver notifications.ts).
export function ProjectWhatsAppGroupPanel({ projectId, currentGroupJid }: { projectId: string; currentGroupJid: string | null }) {
  const [groups, setGroups] = useState<{ id: string; name: string }[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [refreshingGroups, setRefreshingGroups] = useState(false);

  function loadGroups(refresh = false) {
    return projectWhatsAppGroups(projectId, refresh)
      .then((r) => (r.ok ? setGroups(r.groups) : setGroupError(r.error)))
      .catch(() => setGroupError("No se pudieron cargar los grupos."));
  }

  useEffect(() => {
    loadGroups();
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium text-slate-700">Grupo de WhatsApp del proyecto</p>
        <button
          type="button"
          disabled={refreshingGroups}
          onClick={() => {
            setGroupError(null);
            setRefreshingGroups(true);
            loadGroups(true).finally(() => setRefreshingGroups(false));
          }}
          className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          {refreshingGroups ? "Actualizando…" : "Actualizar lista"}
        </button>
      </div>
      {groupError && <p className="text-xs text-red-600">{groupError}</p>}
      <select
        defaultValue={currentGroupJid ?? ""}
        disabled={!groups || isPending}
        onChange={(e) => {
          setSaved(false);
          startTransition(async () => {
            const result = await updateProjectWhatsAppGroup(projectId, e.target.value);
            setSaved("ok" in result && result.ok);
          });
        }}
        className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-60"
      >
        <option value="">— Usar el grupo por defecto —</option>
        {groups?.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
      {!groups && !groupError && <p className="text-xs text-slate-400">Cargando grupos… (requiere WhatsApp conectado)</p>}
      {saved && <p className="text-xs text-emerald-600">Guardado.</p>}
    </div>
  );
}
