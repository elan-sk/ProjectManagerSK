"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "@/lib/useAppRouter";
import { useConfirm } from "@/components/Confirm";
import { SparklesIcon } from "@/components/icons";
import { ModalTrigger } from "@/components/Modal";
import { askInChat } from "@/lib/chatBridge";
import { ClaudeLinkPanel } from "@/components/ClaudeLinkPanel";
import { deleteLearningAction, editLearningAction, exportLearningsAction, generateLearningsAction, setLearningStatusAction } from "./learningActions";

export type LearningUi = {
  id: string;
  topic: string;
  title: string;
  evidence: string;
  recommendation: string;
  number: number;
  status: "PROPOSED" | "APPLIED" | "DISCARDED";
  cutoff: string | null;
  source: string;
  createdAt: string;
  project: { id: string; name: string } | null;
  person: { name: string } | null;
};

const STATUS = { PROPOSED: "Propuesta", APPLIED: "Aplicada", DISCARDED: "Descartada" } as const;
const STATUS_STYLE = { PROPOSED: "bg-amber-50 text-amber-800", APPLIED: "bg-emerald-50 text-emerald-700", DISCARDED: "bg-slate-100 text-slate-500" } as const;
const PERIODS = [
  { id: "month", label: "Último mes" },
  { id: "quarter", label: "Últimos 3 meses" },
  { id: "year", label: "Último año" },
  { id: "all", label: "Todo" },
];
const PILL = "rounded-full border px-3 py-1 text-sm";
const FAILED = { ok: false as const, error: "No se pudo completar. Recargar la página e intentarlo de nuevo." };

async function safe<T>(fn: () => Promise<T>): Promise<T | typeof FAILED> {
  try {
    return await fn();
  } catch (err) {
    console.error("[aprendizajes] falló la acción", err);
    return FAILED;
  }
}

type Props = {
  learnings: LearningUi[];
  projectId: string | null;
  canGenerate: boolean;
  isAdmin: boolean;
  aiConfigured: boolean;
  showProject?: boolean;
  archived?: { id: string; name: string }[];
};

const FORMATS = [
  { id: "docx", label: "Word" },
  { id: "pdf", label: "PDF" },
  { id: "pptx", label: "PowerPoint" },
  { id: "md", label: "Texto (.md)" },
] as const;

function ExportLearnings({ ids }: { ids: string[] }) {
  const [format, setFormat] = useState<(typeof FORMATS)[number]["id"]>("docx");
  const [file, setFile] = useState<{ url: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">{ids.length === 1 ? "1 aprendizaje" : `${ids.length} aprendizajes`}</p>
      <div className="flex flex-wrap gap-2">
        {FORMATS.map((f) => (
          <button key={f.id} type="button" onClick={() => setFormat(f.id)} className={`${PILL} ${format === f.id ? "border-[#073b4c] bg-[#073b4c] text-white" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"}`}>
            {f.label}
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {file && (
        <a href={file.url} download={file.name} className="block truncate text-sm font-medium text-[#0a6b78] hover:underline">
          Descargar {file.name}
        </a>
      )}
      <button
        type="button"
        disabled={pending || ids.length === 0}
        onClick={() =>
          start(async () => {
            setError(null);
            setFile(null);
            const r = await safe(() => exportLearningsAction(ids, format));
            if (r.ok) setFile({ url: r.url, name: r.name });
            else setError(r.error);
          })
        }
        className="w-full rounded-lg bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {pending ? "Armando el documento…" : "Exportar"}
      </button>
    </div>
  );
}

function AskAiButton({ numbers, all }: { numbers: number[]; all: boolean }) {
  const list = numbers.map((n) => `#${n}`).join(", ");
  return (
    <button
      type="button"
      onClick={() =>
        askInChat({
          label: all ? `todos los aprendizajes que se ven (${numbers.length})` : `aprendizajes ${list}`,
          prompt: `La pregunta es sobre ${all ? "todos los aprendizajes que se ven" : "los aprendizajes"} ${list} (consultalos con get_learnings por su número).`,
        })
      }
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-[#0a6b78] hover:bg-slate-50"
    >
      <SparklesIcon className="h-3.5 w-3.5 text-[#0a6b78]" />
      Preguntar a la IA
    </button>
  );
}

function LearningTools({ ids, learningKey }: { ids: string[]; learningKey: string }) {
  return (
    <>
      <ModalTrigger label="Exportar" title="Exportar plan de mejora" variant="secondary" compact>
        <ExportLearnings ids={ids} />
      </ModalTrigger>
      <ModalTrigger label="Conectar IA" title="Conectar IA" variant="secondary" compact icon={<SparklesIcon className="h-3.5 w-3.5" />}>
        <ClaudeLinkPanel learning={{ key: learningKey, ids }} activeLastUsedLabel={null} />
      </ModalTrigger>
    </>
  );
}

function LearningCard({ l, isAdmin, showProject, onError, checked, onToggle }: { l: LearningUi; isAdmin: boolean; showProject: boolean; onError: (e: string) => void; checked: boolean; onToggle: () => void }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: l.title, evidence: l.evidence, recommendation: l.recommendation });
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await safe(fn);
      if (!r.ok) onError(r.error ?? "No se pudo.");
      else router.refresh();
    });

  return (
    <article className={`space-y-3 rounded-2xl border border-slate-100 bg-white p-5 ${l.status === "DISCARDED" ? "opacity-70" : ""}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {l.status !== "DISCARDED" && <input type="checkbox" checked={checked} onChange={onToggle} aria-label={`Seleccionar «${l.title}»`} className="h-4 w-4 cursor-pointer" />}
        <span className="font-semibold text-slate-500">#{l.number}</span>
        <span className="font-semibold tracking-wide text-[#0a6b78] uppercase">{l.topic}</span>
        <span className={`rounded-full px-2 py-0.5 font-medium ${STATUS_STYLE[l.status]}`}>{STATUS[l.status]}</span>
        {showProject && l.project && (
          <Link href={`/projects/${l.project.id}?view=definition`} className="text-slate-500 hover:underline">
            {l.project.name}
          </Link>
        )}
        {!l.project && <span className="text-slate-500">Empresa</span>}
        {l.person && <span className="text-slate-500">· {l.person.name}</span>}
        <span className="text-slate-400">
          · {l.cutoff ?? "A pedido"} · {new Date(l.createdAt).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" })}
          {l.source === "claude" ? " · Claude" : ""}
        </span>
      </div>
      {editing ? (
        <div className="space-y-2">
          {(["title", "evidence", "recommendation"] as const).map((k) => (
            <label key={k} className="block space-y-1">
              <span className="text-sm font-medium text-slate-700">{{ title: "Conclusión", evidence: "Evidencia", recommendation: "Recomendación" }[k]}</span>
              <textarea value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} rows={k === "title" ? 2 : 3} className="block w-full rounded-xl border border-slate-200 px-3 py-2 text-[15px]" />
            </label>
          ))}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(false)} className="rounded-full border border-slate-300 px-4 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
              Cancelar
            </button>
            <button type="button" disabled={pending} onClick={() => run(async () => { const r = await editLearningAction(l.id, draft); if (r.ok) setEditing(false); return r; })} className="rounded-full bg-[#073b4c] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#0a6b78] disabled:opacity-60">
              Guardar
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-[17px] font-semibold leading-snug text-slate-900">{l.title}</p>
          <p className="text-[15px] text-slate-600"><span className="font-medium text-slate-700">Evidencia: </span>{l.evidence}</p>
          <p className="text-[15px] text-slate-800"><span className="font-medium">Recomendación: </span>{l.recommendation}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            {l.status !== "APPLIED" && (
              <button type="button" disabled={pending} onClick={() => run(() => setLearningStatusAction(l.id, "APPLIED"))} className={`${PILL} border-emerald-300 text-emerald-700 hover:bg-emerald-50`}>
                Aplicada
              </button>
            )}
            {l.status !== "DISCARDED" && (
              <button type="button" disabled={pending} onClick={() => run(() => setLearningStatusAction(l.id, "DISCARDED"))} className={`${PILL} border-slate-300 text-slate-600 hover:bg-slate-50`}>
                Descartada
              </button>
            )}
            {l.status !== "PROPOSED" && (
              <button type="button" disabled={pending} onClick={() => run(() => setLearningStatusAction(l.id, "PROPOSED"))} className={`${PILL} border-slate-300 text-slate-600 hover:bg-slate-50`}>
                Volver a propuesta
              </button>
            )}
            {isAdmin && (
              <>
                <button type="button" onClick={() => setEditing(true)} className={`${PILL} border-slate-300 text-slate-600 hover:bg-slate-50 sm:ml-auto`}>
                  Editar
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={async () => {
                    if (await confirm(`¿Eliminar el aprendizaje «${l.title}»?`, { confirmLabel: "Eliminar", danger: true })) run(() => deleteLearningAction(l.id));
                  }}
                  className={`${PILL} border-slate-300 text-slate-500 hover:border-red-300 hover:text-red-700`}
                >
                  Eliminar
                </button>
              </>
            )}
          </div>
        </>
      )}
    </article>
  );
}

export function LearningsPanel({ learnings, projectId, canGenerate, isAdmin, aiConfigured, showProject = false, archived = [] }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<"" | LearningUi["status"]>("");
  const [topic, setTopic] = useState("");
  const [period, setPeriod] = useState("quarter");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const topics = [...new Set(learnings.map((l) => l.topic))];
  const shown = learnings.filter((l) => (!status || l.status === status) && (!topic || l.topic === topic));
  const [picked, setPicked] = useState<string[]>([]);
  const selectable = shown.filter((l) => l.status !== "DISCARDED").map((l) => l.id);
  const pickedShown = picked.filter((id) => selectable.includes(id));
  const allPicked = selectable.length > 0 && pickedShown.length === selectable.length;
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  function generate() {
    setError(null);
    setNotice(null);
    start(async () => {
      const r = await safe(() => generateLearningsAction(projectId, period));
      if (!r.ok) setError(r.error);
      else {
        setNotice(`Se generaron ${r.count} aprendizajes.`);
        router.refresh();
      }
    });
  }

  function retrospective() {
    setError(null);
    start(async () => {
      const failed: string[] = [];
      for (let i = 0; i < selected.length; i++) {
        const p = archived.find((a) => a.id === selected[i]);
        setProgress(`Generando ${i + 1} de ${selected.length}: ${p?.name ?? ""}`);
        const r = await safe(() => generateLearningsAction(selected[i], "all", "Proyecto archivado"));
        if (!r.ok) failed.push(`${p?.name}: ${r.error}`);
      }
      setProgress(null);
      setSelected([]);
      if (failed.length) setError(`No se pudo en: ${failed.join(" · ")}`);
      else setNotice("Retrospectiva lista.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-display text-2xl font-semibold tracking-[-0.02em] text-slate-900">Aprendizajes</h2>
        {canGenerate &&
          (aiConfigured ? (
            <div className="flex flex-wrap items-center gap-2">
              {!projectId && (
                <select value={period} onChange={(e) => setPeriod(e.target.value)} className="rounded-full border border-slate-300 bg-white px-3 py-2 text-sm">
                  {PERIODS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              )}
              <button type="button" disabled={pending} onClick={generate} data-feature-hint={projectId ? "project-learnings" : "company-learnings"} className="inline-flex items-center gap-1.5 rounded-full bg-[#073b4c] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0a6b78] disabled:opacity-60">
                <SparklesIcon className="h-4 w-4" />
                {pending && !progress ? "Generando…" : "Generar aprendizajes"}
              </button>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Falta conectar un servicio de IA en Configuración → Bot</p>
          ))}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}

      {learnings.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {(["", "PROPOSED", "APPLIED", "DISCARDED"] as const).map((s) => (
            <button key={s || "all"} type="button" onClick={() => setStatus(s)} className={`${PILL} ${status === s ? "border-[#073b4c] bg-[#073b4c] text-white" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"}`}>
              {s ? STATUS[s] : "Todos"}
            </button>
          ))}
          {topics.length > 1 && (
            <select value={topic} onChange={(e) => setTopic(e.target.value)} className="rounded-full border border-slate-300 bg-white px-3 py-1 text-sm">
              <option value="">Todos los temas</option>
              {topics.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {selectable.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 px-3 py-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={allPicked} onChange={() => setPicked(allPicked ? [] : selectable)} className="h-4 w-4 cursor-pointer" />
            Seleccionar todos
          </label>
          {pickedShown.length > 0 && <span className="text-sm text-slate-500">{pickedShown.length === 1 ? "1 seleccionado" : `${pickedShown.length} seleccionados`}</span>}
          <span className="flex flex-wrap gap-2 sm:ml-auto">
            <AskAiButton
              all={pickedShown.length === 0}
              numbers={shown.filter((l) => l.status !== "DISCARDED" && (pickedShown.length === 0 || pickedShown.includes(l.id))).map((l) => l.number)}
            />
            {pickedShown.length > 0 && <LearningTools ids={pickedShown} learningKey={`learnings:${projectId ?? "empresa"}`} />}
          </span>
        </div>
      )}

      {shown.length === 0 ? (
        <p className="text-[17px] text-slate-400">{learnings.length === 0 ? "Sin aprendizajes" : "Sin resultados."}</p>
      ) : (
        <div className="space-y-3">
          {shown.map((l) => (
            <LearningCard key={l.id} l={l} isAdmin={isAdmin} showProject={showProject} onError={setError} checked={picked.includes(l.id)} onToggle={() => toggle(l.id)} />
          ))}
        </div>
      )}

      {isAdmin && !projectId && archived.length > 0 && (
        <section className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-5">
          <h3 className="text-base font-semibold text-slate-900">Retrospectiva de archivados</h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {archived.map((p) => (
              <li key={p.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-white px-3 py-2 text-[15px] text-slate-800">
                  <input type="checkbox" checked={selected.includes(p.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, p.id] : selected.filter((x) => x !== p.id))} />
                  <span className="truncate">{p.name}</span>
                </label>
              </li>
            ))}
          </ul>
          {progress && <p className="text-sm text-slate-600">{progress}</p>}
          {aiConfigured && (
            <div className="flex justify-end">
              <button type="button" disabled={pending || selected.length === 0} onClick={retrospective} className="rounded-full bg-[#073b4c] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0a6b78] disabled:opacity-50">
                Generar para {selected.length === 1 ? "1 proyecto" : `${selected.length} proyectos`}
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
