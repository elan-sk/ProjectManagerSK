"use client";

import { Avatar } from "@/components/Avatar";
import { useConfirm } from "@/components/Confirm";
import { ModalTrigger } from "@/components/Modal";
import { ROLE_MAX } from "@/lib/projectRoles";
import {
  DEFINITION_ACTION_BTN,
  DEFINITION_LEVEL_COLOR
} from "@/lib/statusColors";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { removeProjectRole, setProjectRole } from "./roleActions";

// «Equipo y roles» (Definición): quién hace qué EN ESTE proyecto. Es
// informativo — no cambia permisos — y lo edita el PM o un admin. El cargo
// general de cada persona es otro dato (Configuración → Usuarios) y se muestra
// al lado para dar contexto.
export type ProjectRoleRow = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  cargo: string | null;
  role: string;
};

export function ProjectRolesPanel({
  projectId,
  roles,
  members,
  canManage,
}: {
  projectId: string;
  roles: ProjectRoleRow[];
  /** Personas activas del equipo, para elegir a quién describirle un rol. */
  members: { id: string; name: string; cargo: string | null }[];
  canManage: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const withRole = new Set(roles.map((r) => r.userId));
  // Solo quien no tenga rol ya cargado: así «Agregar» no duplica personas.
  const available = members.filter((m) => !withRole.has(m.id));

  function run(
    action: () => Promise<{ ok: boolean; error?: string }>,
    fallback: string,
  ) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) return setError(result.error ?? fallback);
      setEditingId(null);
      router.refresh();
    });
  }

  async function handleRemove(row: ProjectRoleRow) {
    const ok = await confirm(
      `¿Quitar a "${row.name}" del equipo de este proyecto?`,
      { confirmLabel: "Quitar" },
    );
    if (ok)
      run(
        () => removeProjectRole(projectId, row.userId),
        "No se pudo quitar el rol.",
      );
  }

  return (
    <div
      className={`space-y-3 rounded-xl border border-l-4 border-slate-200 ${DEFINITION_LEVEL_COLOR.PHASE.borderLeft} bg-white p-4`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[21px] font-semibold text-slate-900">
          Equipo y roles
        </h2>
        {canManage && available.length > 0 && (
          <ModalTrigger
            label="+ Agregar persona"
            title="Agregar persona al equipo"
            variant="secondary"
            compact
            className={DEFINITION_ACTION_BTN}
          >
            <AddRoleForm
              projectId={projectId}
              members={available}
              onSaved={() => router.refresh()}
            />
          </ModalTrigger>
        )}
      </div>
      {error && <p className="text-[17px] text-red-600">{error}</p>}
      {roles.length === 0 ? (
        <p className="text-[18px] text-slate-400">
          {canManage
            ? "Todavía no hay roles cargados. Agregá quién hace qué en este proyecto."
            : "Todavía no hay roles cargados en este proyecto."}
        </p>
      ) : (
        <ul className="space-y-2">
          {roles.map((row) => (
            <li
              key={row.userId}
              className="rounded-lg border border-slate-100 p-2.5"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Avatar
                    name={row.name}
                    avatarUrl={row.avatarUrl}
                    size="h-8 w-8 text-xs"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-[18px] font-medium text-slate-900">
                      {row.name}
                    </p>
                    {row.cargo && (
                      <p className="truncate text-[15px] text-slate-500">
                        {row.cargo}
                      </p>
                    )}
                  </div>
                </div>
                {canManage && editingId !== row.userId && (
                  <div className="flex flex-shrink-0 items-center gap-2 text-[15px]">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(row.userId);
                        setDraft(row.role);
                      }}
                      className="text-slate-400 hover:text-slate-700 hover:underline"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemove(row)}
                      disabled={isPending}
                      className="text-slate-400 hover:text-red-600 hover:underline"
                    >
                      Quitar
                    </button>
                  </div>
                )}
              </div>
              {editingId === row.userId ? (
                <div className="mt-2 flex gap-2">
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    maxLength={ROLE_MAX}
                    autoFocus
                    className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-[17px]"
                  />
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      run(
                        () => setProjectRole(projectId, row.userId, draft),
                        "No se pudo guardar el rol.",
                      )
                    }
                    className="flex-shrink-0 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[17px] font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                  >
                    Guardar
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="flex-shrink-0 rounded-lg border border-slate-300 px-2.5 py-1.5 text-[17px] text-slate-700 hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <p className="mt-1 text-[17px] text-slate-700">{row.role}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AddRoleForm({
  projectId,
  members,
  onSaved,
}: {
  projectId: string;
  members: { id: string; name: string; cargo: string | null }[];
  onSaved: () => void;
}) {
  const [userId, setUserId] = useState(members[0]?.id ?? "");
  const [role, setRole] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const result = await setProjectRole(projectId, userId, role).catch(() => ({
      ok: false as const,
      error: "No se pudo guardar el rol.",
    }));
    setSaving(false);
    if (!result.ok)
      return setError(result.error ?? "No se pudo guardar el rol.");
    onSaved();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <label className="block space-y-1">
        <span className="text-sm font-medium text-slate-700">Persona</span>
        <select
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
        >
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
              {m.cargo ? ` — ${m.cargo}` : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium text-slate-700">
          Qué hace en este proyecto
        </span>
        <input
          value={role}
          onChange={(e) => setRole(e.target.value)}
          maxLength={ROLE_MAX}
          placeholder="Ej. Arquitecto de datos, enlace con el cliente…"
          className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving || !userId}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          Guardar
        </button>
      </div>
    </form>
  );
}
