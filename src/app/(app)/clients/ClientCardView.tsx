"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "@/lib/useAppRouter";
import { useConfirm } from "@/components/Confirm";
import { ProjectIcon } from "@/components/ProjectIcon";
import { SparklesIcon } from "@/components/icons";
import { deleteClientAction, type ClientCard } from "./actions";
import { ClientForm } from "./ClientForm";

function AssistantLink({ clientId }: { clientId: string }) {
  return (
    <Link href={`/clients/assistant?client=${clientId}`} className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:border-[#0a6b78] hover:bg-slate-50">
      <SparklesIcon className="h-4 w-4 text-[#0a6b78]" />
      Completar cliente con asistente
    </Link>
  );
}

export function ClientCardView({ client, canEdit, aiConfigured = false }: { client: ClientCard; canEdit: boolean; aiConfigured?: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const contact = [client.contactName, client.contactEmail, client.contactPhone].filter(Boolean);

  async function remove() {
    const ok = await confirm(`¿Eliminar el cliente «${client.name}»? Sus proyectos conservan el nombre, sin ficha.`, { confirmLabel: "Eliminar", danger: true });
    if (!ok) return;
    const result = await deleteClientAction(client.id);
    if (!result.ok) return setError(result.error);
    router.push("/company#clientes");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {canEdit && (
        <Link href="/company#clientes" className="text-sm text-slate-500 hover:text-slate-900">
          ← Empresa | Clientes
        </Link>
      )}
      <section className="rounded-3xl border border-slate-100 bg-white px-6 py-8 sm:px-10">
        {editing ? (
          <div className="space-y-6">
            {aiConfigured && <AssistantLink clientId={client.id} />}
            <ClientForm id={client.id} initial={client} onCancel={() => setEditing(false)} />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-4">
                <ProjectIcon name={client.name} iconUrl={client.logoUrl} size="h-14 w-14 text-lg" />
                <h1 className="font-display break-words text-3xl font-semibold tracking-[-0.02em] text-slate-900">{client.name}</h1>
              </div>
              {canEdit && (
                <div className="flex flex-wrap gap-2 sm:shrink-0">
                  <button type="button" onClick={remove} className="rounded-full px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50 hover:text-red-600">
                    Eliminar
                  </button>
                  {aiConfigured && <AssistantLink clientId={client.id} />}
                  <button type="button" onClick={() => setEditing(true)} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    Editar
                  </button>
                </div>
              )}
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            {(contact.length > 0 || client.website) && (
              <div className="space-y-1">
                <h2 className="text-xs font-semibold tracking-wide text-[#0a6b78] uppercase">Contacto</h2>
                {contact.length > 0 && <p className="text-[17px] text-slate-900 [overflow-wrap:anywhere]">{contact.join(" · ")}</p>}
                {client.website && <p className="text-[15px] text-slate-600 [overflow-wrap:anywhere]">{client.website}</p>}
              </div>
            )}
            <div className="space-y-1">
              <h2 className="text-xs font-semibold tracking-wide text-[#0a6b78] uppercase">Perfil</h2>
              {client.profile ? (
                <p className="text-[17px] leading-[1.7] whitespace-pre-line text-slate-900 [overflow-wrap:anywhere]">{client.profile}</p>
              ) : (
                <p className="text-[17px] text-slate-400">Pendiente</p>
              )}
            </div>
            <div className="space-y-2">
              <h2 className="text-xs font-semibold tracking-wide text-[#0a6b78] uppercase">Proyectos</h2>
              {client.projects.length === 0 ? (
                <p className="text-[17px] text-slate-400">Sin proyectos</p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {client.projects.map((p) => (
                    <li key={p.id}>
                      <Link href={`/projects/${p.id}`} className="flex items-center gap-3 rounded-2xl border border-slate-100 px-4 py-3 hover:bg-slate-50">
                        <ProjectIcon name={p.name} iconUrl={p.iconUrl} size="h-8 w-8 text-xs" />
                        <span className="min-w-0 flex-1 truncate text-[15px] text-slate-800">{p.name}</span>
                        {p.archivedAt && <span className="text-xs text-slate-400">Archivado</span>}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
