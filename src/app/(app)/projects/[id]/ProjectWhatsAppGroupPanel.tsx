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

  useEffect(() => {
    projectWhatsAppGroups(projectId).then(setGroups);
  }, [projectId]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-1">
      <p className="text-sm font-medium text-slate-900">Grupo de WhatsApp del proyecto</p>
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
        className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-60"
      >
        <option value="">— Usar el grupo por defecto —</option>
        {groups?.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
      {!groups && <p className="text-xs text-slate-400">Cargando grupos… (requiere WhatsApp conectado)</p>}
      {saved && <p className="text-xs text-emerald-600">Guardado.</p>}
    </div>
  );
}
