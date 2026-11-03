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
  const [groupAttempt, setGroupAttempt] = useState(0);

  useEffect(() => {
    projectWhatsAppGroups(projectId)
      .then(setGroups)
      .catch(() => setGroupError("No se pudieron cargar los grupos."));
  }, [projectId, groupAttempt]);

  return (
    <div className="space-y-1">
      <p className="text-sm font-medium text-slate-700">Grupo de WhatsApp del proyecto</p>
      {groupError && (
        <p className="flex items-center gap-2 text-xs text-red-600">
          {groupError}
          <button
            type="button"
            onClick={() => {
              setGroupError(null);
              setGroupAttempt((n) => n + 1);
            }}
            className="rounded border border-slate-300 px-2 py-0.5 text-slate-700 hover:bg-slate-50"
          >
            Reintentar
          </button>
        </p>
      )}
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
