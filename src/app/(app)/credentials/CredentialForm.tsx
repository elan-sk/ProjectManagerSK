"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useModalClose } from "@/components/Modal";
import { UserCheckList } from "@/components/UserCheckList";
import { EyeIcon, EyeOffIcon } from "@/components/icons";
import { createCredential, listCredentialCandidates, updateCredential, type CredentialDetails } from "./actions";
import type { CredentialPlace } from "@/lib/credentialPlace";

type Visibility = "ALL" | "PROJECT" | "USERS";

const VISIBILITY_OPTIONS: { value: Visibility; label: string; hint: string }[] = [
  { value: "PROJECT", label: "Solo los del proyecto", hint: "PM, asignados y revisores de las tareas del proyecto, y administradores." },
  { value: "ALL", label: "Todos los usuarios", hint: "Cualquier persona del sistema que pueda ver el proyecto." },
  { value: "USERS", label: "Personas concretas", hint: "Solo las personas marcadas en la lista." },
];

const INPUT = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";

/**
 * Crear o editar una contraseña (URL, usuario, contraseña y quién la ve). En una tarea, paso o ajuste
 * queda también en los insumos de la tarea (sus asignados la ven siempre). Al editar, la contraseña
 * vacía conserva la actual.
 */
export function CredentialForm({
  place,
  initial,
  onSaved,
}: {
  /** Dónde se crea (proyecto, tarea, paso o ajuste). Al editar (`initial`) no hace falta. */
  place?: CredentialPlace;
  initial?: CredentialDetails;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const close = useModalClose();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(initial?.name ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [username, setUsername] = useState(initial?.username ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [visibility, setVisibility] = useState<Visibility>(initial?.visibility ?? "PROJECT");
  const [userIds, setUserIds] = useState<string[]>(initial?.allowedUserIds ?? []);
  const [users, setUsers] = useState<{ id: string; name: string; avatarUrl: string | null }[] | null>(null);

  useEffect(() => {
    listCredentialCandidates()
      .then(setUsers)
      .catch(() => setUsers([]));
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const input = { name, url, username, notes, visibility, userIds, password };
      try {
        const result = initial ? await updateCredential(initial.id, input) : place ? await createCredential(input, place) : { ok: false as const, error: "No se pudo guardar la contraseña." };
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.refresh();
        if (onSaved) onSaved();
        else close();
      } catch {
        setError("No se pudo guardar la contraseña. Intente de nuevo en un momento.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <label className="block space-y-1">
        <span className="text-sm text-slate-600">Nombre</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Hosting Hostinger" autoFocus className={INPUT} />
      </label>
      <label className="block space-y-1">
        <span className="text-sm text-slate-600">URL</span>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className={INPUT} />
      </label>
      <label className="block space-y-1">
        <span className="text-sm text-slate-600">Usuario</span>
        <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" className={INPUT} />
      </label>
      <label className="block space-y-1">
        <span className="text-sm text-slate-600">Contraseña</span>
        <span className="relative block">
          <input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            placeholder={initial ? "Dejar vacía para conservar la actual" : ""}
            className={`${INPUT} pr-10`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-700"
          >
            {showPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
          </button>
        </span>
      </label>
      <label className="block space-y-1">
        <span className="text-sm text-slate-600">Notas (opcional)</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={INPUT} />
      </label>

      <fieldset className="space-y-1.5">
        <legend className="mb-1 text-sm text-slate-600">¿Quién puede verla?</legend>
        {VISIBILITY_OPTIONS.map((o) => (
          <label key={o.value} className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 ${visibility === o.value ? "border-slate-900 bg-slate-50" : "border-slate-200"}`}>
            <input type="radio" name="visibility" value={o.value} checked={visibility === o.value} onChange={() => setVisibility(o.value)} className="mt-1" />
            <span>
              <span className="block text-sm font-medium text-slate-800">{o.label}</span>
              <span className="block text-xs text-slate-500">{o.hint}</span>
            </span>
          </label>
        ))}
        {place && !("projectId" in place) && <p className="text-xs text-slate-500">Los asignados de esta tarea siempre pueden verla.</p>}
        {visibility === "USERS" && (
          <div className="rounded-lg border border-slate-200 p-1.5">
            {users === null ? (
              <p className="px-2 py-1.5 text-sm text-slate-400">Cargando personas…</p>
            ) : (
              <UserCheckList
                users={users}
                selectedIds={userIds}
                onToggle={(id, checked) => setUserIds((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)))}
              />
            )}
          </div>
        )}
      </fieldset>

      {!initial && <p className="text-xs text-slate-500">Se avisará por la app y por WhatsApp a quienes puedan verla. El aviso no incluye la contraseña.</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        disabled={isPending}
        className="w-full rounded-lg bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {isPending ? "Guardando…" : initial ? "Guardar cambios" : "Guardar contraseña"}
      </button>
    </form>
  );
}
