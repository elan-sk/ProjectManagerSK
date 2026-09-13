import type { PublicTask } from "@/lib/publicView";

const DATE_FMT: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" };

// Punto 15 confirmado con el usuario: solo texto plano (sin el formato del
// editor) y nunca el estado — a propósito no reusa PublicTaskCard, que sí
// muestra el estado completo para el link puntual de una tarea (punto 16).
// El recorte a ~4-5 líneas (pedido del usuario) se hace con line-clamp en
// el render, no cortando el texto acá — así se ve completo hasta donde
// entre, en vez de un largo fijo en caracteres que no respeta el ancho real.
function summarize(html: string | null) {
  if (!html) return null;
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text || null;
}

export function PublicTasksList({ tasks, phases }: { tasks: PublicTask[]; phases: { id: string; name: string }[] }) {
  return (
    <div className="space-y-6">
      {phases.map((phase) => {
        const phaseTasks = tasks.filter((t) => t.phaseName === phase.name);
        if (phaseTasks.length === 0) return null;
        return (
          <div key={phase.id} className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-700">{phase.name}</h2>
            <div className="space-y-2">
              {phaseTasks.map((t) => {
                const summary = summarize(t.description);
                return (
                  <div key={t.id} className="space-y-1 rounded-xl border border-slate-200 bg-white p-4">
                    <h3 className="font-medium text-slate-900">{t.title}</h3>
                    {summary && <p className="line-clamp-5 text-sm text-slate-600">{summary}</p>}
                    <p className="text-xs text-slate-500">
                      Estimado: {new Date(t.plannedStart).toLocaleDateString("es-CO", DATE_FMT)} — {new Date(t.plannedEnd).toLocaleDateString("es-CO", DATE_FMT)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
