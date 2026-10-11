import { PublicCommentThread } from "./PublicCommentThread";
import { linkifyHtml } from "@/lib/linkify";
import { DEFINITION_LEVEL_FILL } from "@/lib/statusColors";
import { CollapsibleContent } from "@/components/CollapsibleContent";
import type { PublicCommentWithReplies } from "@/lib/publicView";

function ProgressBar({ pct, level }: { pct: number; level: keyof typeof DEFINITION_LEVEL_FILL }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 flex-shrink-0 overflow-hidden bg-slate-100">
        <div className={`${DEFINITION_LEVEL_FILL[level]} h-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="flex-shrink-0 text-[17px] text-slate-500">{pct}%</span>
    </div>
  );
}

type CommentData = PublicCommentWithReplies;

/** Objetivos, requerimientos y fases de solo lectura para el link compartido — sin edición, sin holguras/variaciones internas. Punto 4: ahora también admite comentarios (con respuestas) sobre la Definición del proyecto. */
export function PublicDefinitionView({
  token,
  description,
  objectives,
  requirements,
  phases,
  comments,
}: {
  token: string;
  description: string | null;
  objectives: { id: string; title: string; description: string | null; pct: number }[];
  requirements: { id: string; title: string; description: string | null; pct: number }[];
  phases: { id: string; name: string; pct: number; taskTitles: string[] }[];
  comments: CommentData[];
}) {
  return (
    <div className="space-y-4">
      {description && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <CollapsibleContent>
            <div className="prose prose-lg max-w-none text-slate-700" dangerouslySetInnerHTML={{ __html: linkifyHtml(description) }} />
          </CollapsibleContent>
        </div>
      )}

      <p className="px-1 pt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Alcance</p>

      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-[21px] font-semibold text-slate-900">Objetivos</h2>
        {objectives.length === 0 && <p className="text-[18px] text-slate-400">Sin objetivos definidos.</p>}
        {objectives.map((o) => (
          <div key={o.id} className="space-y-1 border-t border-slate-100 pt-2 first:border-0 first:pt-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[19px] font-semibold text-slate-800">{o.title}</p>
              <ProgressBar pct={o.pct} level="OBJECTIVE" />
            </div>
            {o.description && <p className="text-[18px] text-slate-500">{o.description}</p>}
          </div>
        ))}
      </div>

      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-[21px] font-semibold text-slate-900">Requerimientos</h2>
        {requirements.length === 0 && <p className="text-[18px] text-slate-400">Sin requerimientos definidos.</p>}
        {requirements.map((r) => (
          <div key={r.id} className="space-y-1 border-t border-slate-100 pt-2 first:border-0 first:pt-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[19px] font-semibold text-slate-800">{r.title}</p>
              <ProgressBar pct={r.pct} level="REQUIREMENT" />
            </div>
            {r.description && <p className="text-[18px] text-slate-500">{r.description}</p>}
          </div>
        ))}
      </div>

      <p className="px-1 pt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Cronograma</p>

      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-[21px] font-semibold text-slate-900">Fases</h2>
        {phases.length === 0 && <p className="text-[18px] text-slate-400">Sin fases definidas.</p>}
        {phases.map((p) => (
          <div key={p.id} className="space-y-1.5 border-t border-slate-100 pt-2 first:border-0 first:pt-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[19px] font-semibold text-slate-800">{p.name}</p>
              <ProgressBar pct={p.pct} level="PHASE" />
            </div>
            {p.taskTitles.length > 0 && (
              <ul className="list-disc space-y-0.5 pl-5 text-[18px] text-slate-500">
                {p.taskTitles.map((title, i) => (
                  <li key={i}>{title}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-[21px] font-semibold text-slate-900">Comentarios</h2>
        <PublicCommentThread token={token} comments={comments} />
      </div>
    </div>
  );
}
