"use client";

import { useState } from "react";
import Link from "next/link";
import { ProjectIcon } from "@/components/ProjectIcon";
import { SparklesIcon } from "@/components/icons";
import { normalizeSearchText } from "@/lib/search";

export type CompanyClientRow = { id: string; name: string; logoUrl: string | null; projects: number };

export function CompanyClients({ clients, aiConfigured }: { clients: CompanyClientRow[]; aiConfigured: boolean }) {
  const [query, setQuery] = useState("");
  const q = normalizeSearchText(query.trim());
  const shown = q ? clients.filter((c) => normalizeSearchText(c.name).includes(q)) : clients;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-display text-2xl font-semibold tracking-[-0.02em] text-slate-900">Clientes</h2>
        <div className="flex flex-wrap gap-2">
          <Link href="/clients/new" className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Nuevo cliente
          </Link>
          {aiConfigured && (
            <Link
              href="/clients/assistant"
              data-feature-hint="company-clients"
              className="inline-flex items-center gap-1.5 rounded-full bg-[#073b4c] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0a6b78]"
            >
              <SparklesIcon className="h-4 w-4" />
              Crear cliente con asistente
            </Link>
          )}
        </div>
      </div>
      {clients.length > 6 && (
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar cliente…" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-[15px]" />
      )}
      {shown.length === 0 ? (
        <p className="text-[17px] text-slate-400">{clients.length === 0 ? "Sin clientes" : "Sin resultados."}</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {shown.map((c) => (
            <li key={c.id}>
              <Link href={`/clients/${c.id}`} className="flex items-center gap-3 rounded-2xl border border-slate-100 px-4 py-3 hover:bg-slate-50">
                <ProjectIcon name={c.name} iconUrl={c.logoUrl} size="h-9 w-9 text-sm" />
                <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-slate-800">{c.name}</span>
                <span className="shrink-0 text-sm text-slate-500">{c.projects === 1 ? "1 proyecto" : `${c.projects} proyectos`}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
