"use client";

import { useState } from "react";
import { useRouter } from "@/lib/useAppRouter";
import { ModalShell, ModalTrigger } from "@/components/Modal";
import { SearchableSelect } from "@/components/SearchableSelect";
import { ProjectIcon, type ProjectIconParent } from "@/components/ProjectIcon";
import { LinkFavicon } from "@/components/LinkFavicon";
import { useConfirm } from "@/components/Confirm";
import { useToast } from "@/components/Toast";
import { CheckIcon, ExternalLinkIcon, GlobeIcon, KeyIcon, PencilIcon, PlusIcon, SearchIcon, TrashIcon, UserIcon } from "@/components/icons";
import { normalizeSearchText } from "@/lib/search";
import { credentialUrlLabel } from "@/lib/attachments";
import { CredentialLoader } from "./CredentialView";
import { CredentialForm } from "./CredentialForm";
import { copyCredentialPassword, deleteCredential, recordCredentialEvent } from "./actions";

export type BoardCredential = {
  id: string;
  name: string;
  url: string | null;
  username: string | null;
  canManage: boolean;
};
export type BoardProject = {
  id: string;
  name: string;
  iconUrl: string | null;
  parent: ProjectIconParent;
  canAdd: boolean;
  credentials: BoardCredential[];
};

const safeHref = (url: string | null) => (url && /^https?:\/\//i.test(url) ? url : undefined);

/** Copia al portapapeles. Con ClipboardItem la promesa se resuelve dentro del clic (Safari pierde el permiso tras un await). */
async function copyText(value: Promise<string | null> | string) {
  if (typeof value !== "string" && typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    const blob = value.then((v) => {
      if (v === null) throw new Error("sin dato");
      return new Blob([v], { type: "text/plain" });
    });
    await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
    return;
  }
  const text = await value;
  if (text === null) throw new Error("sin dato");
  await navigator.clipboard.writeText(text);
}

const iconButton = "flex h-7 w-7 flex-shrink-0 cursor-pointer items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50";

function CredentialRow({ credential, onOpen }: { credential: BoardCredential; onOpen: (editing: boolean) => void }) {
  const router = useRouter();
  const confirm = useConfirm();
  const showToast = useToast();
  const [copied, setCopied] = useState<"user" | "password" | null>(null);
  const [busy, setBusy] = useState(false);
  const href = safeHref(credential.url);

  async function copy(kind: "user" | "password") {
    // Mensaje del servidor (sin acceso, no se puede leer): el portapapeles lo pierde al rechazar.
    let serverError: string | null = null;
    try {
      if (kind === "user") {
        await copyText(credential.username ?? "");
        recordCredentialEvent(credential.id, "COPY_USERNAME").catch(() => {});
      } else {
        await copyText(
          copyCredentialPassword(credential.id).then((r) => {
            if (r.ok) return r.password;
            serverError = r.error;
            return null;
          }),
        );
      }
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      showToast(serverError ?? "No se pudo copiar. Abra la contraseña y cópiela desde ahí.");
    }
  }

  async function remove() {
    const ok = await confirm(`¿Eliminar la contraseña "${credential.name}"? Se quitará del proyecto y de todas las tareas donde está. Esta acción no se puede deshacer.`, {
      confirmLabel: "Eliminar",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    const result = await deleteCredential(credential.id).catch(() => ({
      ok: false as const,
      error: "No se pudo eliminar la contraseña.",
    }));
    setBusy(false);
    if (!result.ok) return showToast(result.error);
    router.refresh();
  }

  return (
    <li className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-slate-50">
      <button type="button" onClick={() => onOpen(false)} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left">
        {/* Ícono del sitio: dice de dónde es la contraseña de un vistazo (sin URL, la llave). */}
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white">
          {href ? <LinkFavicon url={href} className="h-5 w-5" fallback={<GlobeIcon className="h-5 w-5 text-slate-400" />} /> : <KeyIcon className="h-4 w-4 text-red-600" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-slate-800">{credential.name}</span>
          <span className="block truncate text-xs text-slate-400">{credential.username || credentialUrlLabel(credential.url) || "Contraseña"}</span>
        </span>
      </button>
      <span className="flex flex-shrink-0 items-center">
        {credential.username && (
          <button type="button" onClick={() => copy("user")} title="Copiar usuario" aria-label="Copiar usuario" className={iconButton}>
            {copied === "user" ? <CheckIcon className="h-4 w-4 text-emerald-600" /> : <UserIcon className="h-4 w-4" />}
          </button>
        )}
        <button
          type="button"
          onClick={() => copy("password")}
          title="Copiar contraseña"
          aria-label="Copiar contraseña"
          className={`${iconButton} text-red-600/70 hover:text-red-700`}
        >
          {copied === "password" ? <CheckIcon className="h-4 w-4 text-emerald-600" /> : <KeyIcon className="h-4 w-4" />}
        </button>
        {href && (
          <a href={href} target="_blank" rel="noreferrer" title="Abrir el sitio" aria-label="Abrir el sitio" className={iconButton}>
            <ExternalLinkIcon className="h-4 w-4" />
          </a>
        )}
        {credential.canManage && (
          <>
            <button type="button" onClick={() => onOpen(true)} title="Editar" aria-label="Editar" className={iconButton}>
              <PencilIcon className="h-4 w-4" />
            </button>
            <button type="button" onClick={remove} disabled={busy} title="Eliminar" aria-label="Eliminar" className={`${iconButton} hover:text-red-600`}>
              <TrashIcon className="h-4 w-4" />
            </button>
          </>
        )}
      </span>
    </li>
  );
}

/** «Agregar contraseña» general: primero se elige el proyecto al que queda asociada, luego el formulario de siempre. */
export type AddableProject = { id: string; name: string; iconUrl: string | null; parent: ProjectIconParent };

const smallProjectIcon = (p: { name: string; iconUrl: string | null; parent: ProjectIconParent }) => (
  <ProjectIcon name={p.name} iconUrl={p.iconUrl} parent={p.parent} size="h-5 w-5 text-[9px]" inline />
);

function NewCredentialForm({ projects }: { projects: AddableProject[] }) {
  const [projectId, setProjectId] = useState(projects.length === 1 ? projects[0].id : "");
  return (
    // El formulario va completo desde el inicio: el modal tiene su alto normal y la lista del selector se abre encima sin recortarse.
    <div className="space-y-3">
      <div className="space-y-1">
        <span className="text-sm text-slate-600">Proyecto</span>
        <SearchableSelect
          name="projectId"
          options={projects.map((p) => ({ id: p.id, label: p.name, icon: smallProjectIcon(p) }))}
          defaultValue={projectId}
          onChange={setProjectId}
          placeholder="Elegir proyecto…"
          searchPlaceholder="Buscar proyecto…"
        />
      </div>
      <CredentialForm place={projectId ? { projectId } : undefined} />
    </div>
  );
}

/** Tablero de /credentials: un bloque por proyecto en columnas tipo masonry, con filtro por texto. */
export function CredentialsBoard({ projects, addableProjects }: { projects: BoardProject[]; addableProjects: AddableProject[] }) {
  const [query, setQuery] = useState("");
  const [opened, setOpened] = useState<{ id: string; editing: boolean } | null>(null);
  const needle = normalizeSearchText(query.trim());
  const shown = needle
    ? projects
        .map((p) => {
          if (normalizeSearchText(p.name).includes(needle)) return p;
          const credentials = p.credentials.filter((c) => normalizeSearchText(`${c.name} ${c.url ?? ""} ${c.username ?? ""}`).includes(needle));
          return { ...p, credentials };
        })
        .filter((p) => p.credentials.length > 0)
    : projects;
  const total = projects.reduce((n, p) => n + p.credentials.length, 0);

  return (
    <div className="space-y-4">
      {/* Título a la izquierda, filtro al centro y «Agregar contraseña» a la derecha; apilados en pantallas chicas. */}
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[1fr_auto_1fr] lg:items-center">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
          Gestor de contraseñas <span className="text-base font-normal text-slate-400">{total}</span>
        </h1>
        <label className="relative w-full lg:w-96">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrar por nombre, sitio, usuario o proyecto"
            aria-label="Filtrar contraseñas"
            autoComplete="off"
            className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pr-3 pl-8 text-sm outline-none focus:border-[#0a6b78]"
          />
        </label>
        {addableProjects.length > 0 ? (
          <span data-feature-hint="credentials-add" className="lg:justify-self-end">
            <ModalTrigger label="Agregar contraseña" title="Nueva contraseña" icon={<PlusIcon className="h-4 w-4" />}>
              <NewCredentialForm projects={addableProjects} />
            </ModalTrigger>
          </span>
        ) : (
          <span aria-hidden />
        )}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
          {total === 0 ? "Todavía no hay contraseñas disponibles." : "Ninguna contraseña coincide."}
        </p>
      ) : (
        <div className="columns-1 gap-4 sm:columns-2 xl:columns-3 2xl:columns-4">
          {shown.map((p) => (
            <section key={p.id} className="mb-4 break-inside-avoid rounded-xl border border-slate-200 bg-white p-3">
              <header className="mb-1.5 flex items-center gap-2 border-b border-slate-100 px-1 pb-2">
                <ProjectIcon name={p.name} iconUrl={p.iconUrl} parent={p.parent} projectId={p.id} size="h-7 w-7 text-xs" />
                <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{p.name}</h2>
                <span className="text-xs text-slate-400">{p.credentials.length}</span>
                {p.canAdd && (
                  <ModalTrigger
                    label=""
                    title={`Nueva contraseña · ${p.name}`}
                    titleIcon={smallProjectIcon(p)}
                    ariaLabel="Agregar contraseña a este proyecto"
                    icon={<PlusIcon className="h-4 w-4" />}
                    className="flex h-7 w-7 flex-shrink-0 cursor-pointer items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <CredentialForm place={{ projectId: p.id }} />
                  </ModalTrigger>
                )}
              </header>
              <ul>
                {p.credentials.map((c) => (
                  <CredentialRow key={c.id} credential={c} onOpen={(editing) => setOpened({ id: c.id, editing })} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <ModalShell open={opened !== null} onClose={() => setOpened(null)} title="Contraseña">
        {opened && <CredentialLoader key={`${opened.id}-${opened.editing}`} credentialId={opened.id} initialEditing={opened.editing} onClose={() => setOpened(null)} />}
      </ModalShell>
    </div>
  );
}
