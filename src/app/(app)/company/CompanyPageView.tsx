"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "@/lib/useAppRouter";
import { useConfirm } from "@/components/Confirm";
import { useFileViewer, type ViewFile } from "@/components/FileViewer";
import { renderMessage } from "@/components/chat/chatMarkdown";
import { CheckIcon, PaperclipIcon, SparklesIcon, TrashIcon } from "@/components/icons";
import { removeCompanyDocumentAction, saveCompanyTopicText, type CompanyProfileUi } from "./actions";
import { CompanyBrandForm } from "./CompanyBrandForm";
import { CompanyClients, type CompanyClientRow } from "./CompanyClients";

const ASSISTANT_PATH = "/company/assistant";
const SECTIONS = [
  { id: "perfil", label: "Perfil" },
  { id: "identidad", label: "Identidad" },
  { id: "documentos", label: "Documentos" },
  { id: "clientes", label: "Clientes" },
];

function TopicBlock({ topicKey, label, text, openFile, children }: { topicKey: string; label: string; text: string | null; openFile: (f: ViewFile) => void; children?: React.ReactNode }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(text ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  function save() {
    setError(null);
    startSaving(async () => {
      const result = await saveCompanyTopicText(topicKey, value);
      if (!result.ok) return setError(result.error);
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <article className="group space-y-2 border-t border-slate-100 py-6 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-[#0a6b78] uppercase">
          {text ? <CheckIcon className="h-4 w-4 text-emerald-600" /> : <span aria-hidden="true" className="h-4 w-4 rounded-full border-2 border-slate-200" />}
          {label}
        </h3>
        {!editing && (
          <button type="button" onClick={() => { setValue(text ?? ""); setEditing(true); }} className="rounded-lg px-2.5 py-1 text-sm font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-900">
            Editar
          </button>
        )}
      </div>
      {editing ? (
        <div className="space-y-3">
          <textarea value={value} onChange={(e) => setValue(e.target.value)} rows={5} className="block w-full rounded-2xl border border-slate-200 px-4 py-3 text-[17px] leading-relaxed" />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(false)} disabled={isSaving} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60">
              Cancelar
            </button>
            <button type="button" onClick={save} disabled={isSaving} className="rounded-full bg-[#073b4c] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0a6b78] disabled:opacity-60">
              {isSaving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      ) : text ? (
        <div className="text-[17px] leading-[1.7] text-slate-900 [overflow-wrap:anywhere] [&_strong]:font-semibold">{renderMessage(text, openFile)}</div>
      ) : (
        <p className="text-[17px] text-slate-400">Pendiente</p>
      )}
      {children}
    </article>
  );
}

export function CompanyPageView({ profile, aiConfigured, clients }: { profile: CompanyProfileUi; aiConfigured: boolean; clients: CompanyClientRow[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const fileViewer = useFileViewer();
  const [docError, setDocError] = useState<string | null>(null);
  const empty = !profile.name && profile.covered === 0;
  const assistantLabel = empty ? "Empezar con el asistente" : profile.covered < profile.total ? "Seguir con el asistente" : "Repasar con el asistente";
  const logo = profile.brand?.logoPngUrl ?? null;

  async function removeDocument(id: string, name: string) {
    const ok = await confirm(`¿Quitar «${name}» de los documentos de la empresa?`, { confirmLabel: "Quitar", danger: true });
    if (!ok) return;
    setDocError(null);
    const result = await removeCompanyDocumentAction(id);
    if (!result.ok) return setDocError(result.error);
    router.refresh();
  }

  return (
    <div className="mx-auto flex max-w-6xl gap-8">
      {fileViewer.viewer}
      <aside className="sticky top-20 hidden h-fit w-56 shrink-0 lg:block">
        <nav className="space-y-1">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="block rounded-xl px-3 py-2 text-[15px] font-medium text-slate-600 hover:bg-white hover:text-slate-900">
              {s.label}
            </a>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1 space-y-6">
        <section className="rounded-3xl border border-slate-100 bg-white px-6 py-8 shadow-[0_12px_32px_rgba(7,59,76,0.06)] sm:px-10">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-5">
              {logo ? (
                <img src={logo} alt="" className="h-16 max-w-40 shrink-0 object-contain" />
              ) : (
                <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-slate-50 font-display text-2xl font-semibold text-[#0a6b78]">
                  {(profile.name ?? "E").trim().charAt(0).toUpperCase()}
                </span>
              )}
              <div className="min-w-0">
                <h1 className="font-display break-words text-3xl font-semibold tracking-[-0.02em] text-slate-900 sm:text-4xl">{profile.name ?? "Empresa"}</h1>
                <p className="mt-1 text-[15px] text-slate-500">
                  {profile.covered} de {profile.total} temas
                </p>
              </div>
            </div>
            {aiConfigured ? (
              <Link href={ASSISTANT_PATH} className="inline-flex shrink-0 items-center gap-2 self-start rounded-full bg-[#073b4c] px-6 py-3 text-base font-semibold text-white shadow-[0_12px_32px_rgba(7,59,76,0.13)] hover:bg-[#0a6b78] sm:self-center">
                <SparklesIcon className="h-5 w-5" />
                {assistantLabel}
              </Link>
            ) : (
              <p className="text-sm text-slate-500">Falta conectar un servicio de IA en Configuración → Bot</p>
            )}
          </div>
          <div className="mt-6 h-1.5 w-full overflow-hidden rounded-full bg-slate-50" role="progressbar" aria-valuemin={0} aria-valuemax={profile.total} aria-valuenow={profile.covered}>
            <div className="h-full rounded-full bg-[#0a6b78]" style={{ width: `${(profile.covered / profile.total) * 100}%` }} />
          </div>
        </section>

        <section id="perfil" className="scroll-mt-20 rounded-3xl border border-slate-100 bg-white px-6 py-8 sm:px-10">
          <h2 className="mb-6 font-display text-2xl font-semibold tracking-[-0.02em] text-slate-900">Perfil</h2>
          <TopicBlock topicKey="name" label="Nombre de la empresa" text={profile.name} openFile={fileViewer.open} />
          {profile.items.map((item) => (
            <TopicBlock key={item.key} topicKey={item.key} label={item.label} text={item.text} openFile={fileViewer.open}>
              {item.key === "workflow" && profile.taskTypes.length > 0 && (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {profile.taskTypes.map((t) => (
                    <div key={t.label} className="rounded-2xl bg-slate-50 px-4 py-3">
                      <p className="text-sm font-semibold text-slate-900">{t.label}</p>
                      <p className="text-[15px] leading-snug text-slate-600">{t.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </TopicBlock>
          ))}
        </section>

        <section id="identidad" className="scroll-mt-20 rounded-3xl border border-slate-100 bg-white px-6 py-8 sm:px-10">
          <CompanyBrandForm brand={profile.brand} />
        </section>

        <section id="documentos" className="scroll-mt-20 rounded-3xl border border-slate-100 bg-white px-6 py-8 sm:px-10">
          <h2 className="mb-5 font-display text-2xl font-semibold tracking-[-0.02em] text-slate-900">Documentos</h2>
          {profile.documents.length === 0 ? (
            <p className="text-[17px] text-slate-400">Sin documentos</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {profile.documents.map((d) => (
                <li key={d.id} className="flex items-center gap-2 rounded-2xl border border-slate-100 px-4 py-3">
                  <PaperclipIcon className="h-5 w-5 shrink-0 text-slate-500" />
                  <button type="button" onClick={() => fileViewer.open({ url: d.url, name: d.name })} className="min-w-0 flex-1 truncate text-left text-[15px] text-slate-800 hover:underline">
                    {d.name}
                  </button>
                  <button type="button" onClick={() => removeDocument(d.id, d.name)} aria-label={`Quitar ${d.name}`} className="shrink-0 rounded-full p-1.5 text-slate-400 hover:bg-slate-50 hover:text-red-600">
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {docError && <p className="mt-2 text-sm text-red-600">{docError}</p>}
        </section>

        <section id="clientes" className="scroll-mt-20 rounded-3xl border border-slate-100 bg-white px-6 py-8 sm:px-10">
          <CompanyClients clients={clients} aiConfigured={aiConfigured} />
        </section>
      </div>
    </div>
  );
}
