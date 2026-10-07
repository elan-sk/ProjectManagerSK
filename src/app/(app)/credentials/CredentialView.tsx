"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useConfirm } from "@/components/Confirm";
import { CheckIcon, CopyIcon, EyeIcon, EyeOffIcon, KeyIcon } from "@/components/icons";
import { CredentialForm } from "./CredentialForm";
import { deleteCredential, getCredentialAccessLog, getCredentialDetails, recordCredentialEvent, unlinkCredential, type CredentialDetails, type CredentialLogEntry } from "./actions";
import { CREDENTIAL_EVENT_LABEL, removeFromPlaceLabel, type CredentialPlace } from "@/lib/credentialPlace";

const VISIBILITY_TEXT: Record<CredentialDetails["visibility"], string> = {
  ALL: "Todos los usuarios",
  PROJECT: "Solo los del proyecto",
  USERS: "Personas concretas",
};

/** Un dato (URL, usuario o contraseña) con su propio botón para copiarlo. */
function CopyField({
  label,
  value,
  secret,
  href,
  onCopied,
  onRevealed,
}: {
  label: string;
  value: string | null;
  secret?: boolean;
  href?: string;
  /** Queda en el historial de acceso. */
  onCopied?: () => void;
  onRevealed?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [visible, setVisible] = useState(!secret);
  const [copyError, setCopyError] = useState(false);

  async function copy() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      onCopied?.();
      setCopyError(false);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Navegador sin permiso de portapapeles: se muestra el dato para copiarlo a mano.
      if (!visible) onRevealed?.();
      setVisible(true);
      setCopyError(true);
    }
  }

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <span className="min-w-0 flex-1 truncate font-mono text-sm text-slate-800 select-all" title={visible && value ? value : undefined}>
          {!value ? (
            <span className="font-sans text-slate-400">Sin dato</span>
          ) : !visible ? (
            "••••••••••"
          ) : href ? (
            <a href={href} target="_blank" rel="noreferrer" className="hover:underline">
              {value}
            </a>
          ) : (
            value
          )}
        </span>
        {secret && value && (
          <button
            type="button"
            onClick={() => {
              if (!visible) onRevealed?.();
              setVisible((v) => !v);
            }}
            aria-label={visible ? "Ocultar" : "Mostrar"} className="flex-shrink-0 p-1 text-slate-400 hover:text-slate-700">
            {visible ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
          </button>
        )}
        {value && (
          <button
            type="button"
            onClick={copy}
            aria-label={`Copiar ${label.toLowerCase()}`}
            title={copied ? "¡Copiado!" : `Copiar ${label.toLowerCase()}`}
            className="flex flex-shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
          >
            {copied ? <CheckIcon className="h-3.5 w-3.5 text-emerald-600" /> : <CopyIcon className="h-3.5 w-3.5" />}
            {copied ? "Copiado" : "Copiar"}
          </button>
        )}
      </div>
      {copyError && <p className="text-xs text-amber-700">No se pudo copiar automáticamente. Seleccione el texto y cópielo a mano.</p>}
    </div>
  );
}

const safeHref = (url: string | null) => (url && /^https?:\/\//i.test(url) ? url : undefined);

/**
 * Detalle de una contraseña: URL, usuario y contraseña con su botón de copiar, notas y quién la ve.
 * `place` + `canRemove`: abierta desde una tarea, paso o ajuste — ofrece quitarla de ahí.
 */
export function CredentialView({
  credential,
  place,
  canRemove = false,
  onChanged,
  onDeleted,
}: {
  credential: CredentialDetails;
  place?: CredentialPlace;
  canRemove?: boolean;
  onChanged?: () => void;
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (editing) {
    return (
      <CredentialForm
        initial={credential}
        onSaved={() => {
          setEditing(false);
          onChanged?.();
        }}
      />
    );
  }

  async function handleDelete() {
    const ok = await confirm(`¿Eliminar la contraseña "${credential.name}"? Se quitará del proyecto y de todas las tareas donde está. Esta acción no se puede deshacer.`, {
      confirmLabel: "Eliminar",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    const result = await deleteCredential(credential.id).catch(() => ({ ok: false as const, error: "No se pudo eliminar la contraseña." }));
    setBusy(false);
    if (!result.ok) return setError(result.error);
    router.refresh();
    onDeleted?.();
  }

  const removeLabel = place && canRemove ? removeFromPlaceLabel(place) : null;
  const log = (event: "REVEAL" | "COPY_URL" | "COPY_USERNAME" | "COPY_PASSWORD") => {
    recordCredentialEvent(credential.id, event).catch(() => {});
  };

  async function handleUnlink() {
    if (!place || !removeLabel) return;
    const ok = await confirm(`¿${removeLabel} "${credential.name}"? La contraseña sigue disponible en el proyecto.`, { confirmLabel: "Quitar" });
    if (!ok) return;
    setBusy(true);
    const result = await unlinkCredential(credential.id, place).catch(() => ({ ok: false as const, error: "No se pudo quitar la contraseña." }));
    setBusy(false);
    if (!result.ok) return setError(result.error);
    router.refresh();
    onDeleted?.();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[#0a6b78]/10 text-[#0a6b78]">
          <KeyIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-900">{credential.name}</p>
          <p className="truncate text-xs text-slate-500">Proyecto: {credential.projectName}</p>
        </div>
      </div>

      <div className="space-y-3">
        <CopyField label="URL" value={credential.url} href={safeHref(credential.url)} onCopied={() => log("COPY_URL")} />
        <CopyField label="Usuario" value={credential.username} onCopied={() => log("COPY_USERNAME")} />
        {credential.password === null ? (
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-500">Contraseña</p>
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              La contraseña guardada no se puede leer. Quien la administra debe volver a cargarla.
            </p>
          </div>
        ) : (
          <CopyField label="Contraseña" value={credential.password} secret onCopied={() => log("COPY_PASSWORD")} onRevealed={() => log("REVEAL")} />
        )}
      </div>

      {credential.notes && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-500">Notas</p>
          <p className="whitespace-pre-wrap text-sm text-slate-700">{credential.notes}</p>
        </div>
      )}

      <div className="space-y-0.5 text-xs text-slate-500">
        <p>Quién la ve: {VISIBILITY_TEXT[credential.visibility]}{credential.tasks.length > 0 ? ", y los asignados de las tareas donde está" : ""}.</p>
        {credential.tasks.length > 0 && (
          <p>
            En las tareas:{" "}
            {credential.tasks.map((t, i) => (
              <span key={t.id}>
                {i > 0 && ", "}
                <Link href={`/projects/${credential.projectId}/tasks/${t.id}`} className="underline hover:text-slate-800">
                  {t.title}
                </Link>
              </span>
            ))}
          </p>
        )}
        {credential.createdByName && <p>Compartida por {credential.createdByName}.</p>}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {credential.canManage && <AccessLog credentialId={credential.id} />}

      {(credential.canManage || removeLabel) && (
        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          {credential.canManage && (
            <button type="button" onClick={() => setEditing(true)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
              Editar
            </button>
          )}
          {removeLabel && (
            <button type="button" disabled={busy} onClick={handleUnlink} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60">
              {removeLabel}
            </button>
          )}
          {credential.canManage && (
            <button type="button" disabled={busy} onClick={handleDelete} className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-60">
              Eliminar
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Carga el detalle al abrir (la contraseña nunca viaja en las listas) y lo muestra. */
export function CredentialLoader({ credentialId, place, canRemove, onClose }: { credentialId: string; place?: CredentialPlace; canRemove?: boolean; onClose: () => void }) {
  const [state, setState] = useState<{ credential: CredentialDetails } | { error: string } | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    getCredentialDetails(credentialId)
      .then((r) => alive && setState(r.ok ? { credential: r.credential } : { error: r.error }))
      .catch(() => alive && setState({ error: "No se pudo abrir la contraseña. Intente de nuevo en un momento." }));
    return () => {
      alive = false;
    };
  }, [credentialId, version]);

  if (!state) return <p className="text-sm text-slate-400">Abriendo contraseña…</p>;
  if ("error" in state) return <p className="text-sm text-slate-600">{state.error}</p>;
  return <CredentialView credential={state.credential} place={place} canRemove={canRemove} onChanged={() => setVersion((v) => v + 1)} onDeleted={onClose} />;
}

const LOG_DATE = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short" });

/** Historial de acceso (quién abrió, mostró o copió, y cuándo): se carga al pedirlo. */
function AccessLog({ credentialId }: { credentialId: string }) {
  const [entries, setEntries] = useState<CredentialLogEntry[] | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (open) return setOpen(false);
    setOpen(true);
    const result = await getCredentialAccessLog(credentialId).catch(() => ({ ok: false as const, error: "No se pudo cargar el historial." }));
    if (result.ok) setEntries(result.entries);
    else setError(result.error);
  }

  return (
    <div className="space-y-1.5">
      <button type="button" onClick={toggle} className="text-xs font-medium text-slate-500 underline hover:text-slate-800">
        {open ? "Ocultar historial de acceso" : "Ver historial de acceso"}
      </button>
      {open && (
        <div className="max-h-56 overflow-x-hidden overflow-y-auto rounded-lg border border-slate-200">
          {error ? (
            <p className="px-3 py-2 text-xs text-red-600">{error}</p>
          ) : entries === null ? (
            <p className="px-3 py-2 text-xs text-slate-400">Cargando…</p>
          ) : entries.length === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-400">Todavía nadie la ha abierto.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-xs">
              {entries.map((e) => (
                <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-1.5">
                  <span className="min-w-0 text-slate-700">
                    <span className="font-medium">{e.userName}</span> · {CREDENTIAL_EVENT_LABEL[e.event]}
                    {e.source === "api" && <span className="ml-1 rounded bg-slate-100 px-1 text-[10px] font-semibold text-slate-500">API</span>}
                  </span>
                  <span className="flex-shrink-0 text-slate-400 tabular-nums">{LOG_DATE.format(new Date(e.createdAt))}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
