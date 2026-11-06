import { normalizeSearchText } from "@/lib/search";

export const PROJECT_STEPS = [
  { key: "project", label: "Proyecto" },
  { key: "client", label: "Cliente" },
  { key: "dates", label: "Tiempos" },
  { key: "team", label: "Equipo" },
  { key: "objectives", label: "Objetivos" },
  { key: "requirements", label: "Requerimientos" },
  { key: "phases", label: "Fases" },
  { key: "tasks", label: "Tareas" },
] as const;

export const CLIENT_STEPS = [
  { key: "name", label: "Nombre" },
  { key: "business", label: "A qué se dedica" },
  { key: "contact", label: "Contacto" },
  { key: "expectations", label: "Qué espera" },
] as const;

export type StepDef = { key: string; label: string };
export type ProjectFacts = {
  description: string | null;
  clientId: string | null;
  targetEndDate: Date | null;
  roles: number;
  objectives: number;
  requirements: number;
  phaseNames: string[];
  tasks: number;
};
export type StepMarks = { focus: string | null; skipped: Set<string>; done: Set<string> };

export function projectCoverage(p: ProjectFacts | null): Set<string> {
  const done = new Set<string>();
  if (!p) return done;
  if (p.description?.replace(/<[^>]+>/g, "").trim()) done.add("project");
  if (p.clientId) done.add("client");
  if (p.targetEndDate) done.add("dates");
  if (p.roles > 0) done.add("team");
  if (p.objectives > 0) done.add("objectives");
  if (p.requirements > 0) done.add("requirements");
  if (p.phaseNames.some((n) => normalizeSearchText(n.trim()) !== "general")) done.add("phases");
  if (p.tasks > 0) done.add("tasks");
  return done;
}

export function stepMarksFromHistory(contents: string[]): StepMarks {
  const marks: StepMarks = { focus: null, skipped: new Set(), done: new Set() };
  for (const raw of contents) {
    let blocks: Array<{ type?: string; name?: string; input?: { step?: string; action?: string } }>;
    try {
      blocks = JSON.parse(raw);
    } catch {
      continue;
    }
    for (const b of Array.isArray(blocks) ? blocks : []) {
      if (b.type !== "tool_use" || b.name !== "assistant_step" || !b.input?.step) continue;
      const { step, action } = b.input;
      if (action === "skip") marks.skipped.add(step);
      else if (action === "done") marks.done.add(step);
      else {
        marks.focus = step;
        marks.skipped.delete(step);
      }
    }
  }
  return marks;
}

export function stepStates(defs: readonly StepDef[], covered: Set<string>, marks: StepMarks) {
  const done = new Set([...covered, ...marks.done]);
  const firstOpen = defs.find((d) => !done.has(d.key) && !marks.skipped.has(d.key))?.key ?? null;
  const current = marks.focus && !done.has(marks.focus) ? marks.focus : firstOpen;
  const items = defs.map((d) => ({ key: d.key, label: d.label, done: done.has(d.key), current: d.key === current }));
  return { items, covered: items.filter((i) => i.done).length, total: defs.length };
}

export const TASK_STEPS = [
  { key: "what", label: "Qué hay que hacer" },
  { key: "type", label: "Tipo" },
  { key: "phase", label: "Fase y requerimiento" },
  { key: "people", label: "Responsable y revisores" },
  { key: "dates", label: "Fechas y dependencias" },
  { key: "checklist", label: "Checklist e insumos" },
  { key: "design", label: "Pruebas o ítems" },
] as const;

export type TaskFacts = { description: string | null; type: string; requirements: number; assignees: number; reviewers: number; steps: number; insumos: number; designItems: number; tags: number; projectUsesTags: boolean };

export function taskCoverage(t: TaskFacts | null): Set<string> {
  const done = new Set<string>();
  if (!t) return done;
  done.add("type");
  done.add("dates");
  if (t.description?.replace(/<[^>]+>/g, "").trim()) done.add("what");
  if (t.requirements > 0) done.add("phase");
  if (t.assignees > 0) done.add("people");
  if (t.steps > 0 && t.insumos > 0) done.add("checklist");
  if (!DESIGN_TYPES.includes(t.type) || t.designItems > 0) done.add("design");
  return done;
}

const DESIGN_TYPES = ["QA", "ADJUSTMENT", "ACCEPTANCE"];

export function taskGaps(t: TaskFacts): string[] {
  const gaps: string[] = [];
  if (t.insumos === 0) gaps.push("Insumos: no tiene ningún archivo ni link (brief, textos, imágenes, accesos o referencias para hacerla)");
  if (!t.description?.replace(/<[^>]+>/g, "").trim()) gaps.push("Descripción: está vacía");
  if (t.steps === 0) gaps.push("Checklist: no tiene pasos");
  if (t.requirements === 0) gaps.push("Requerimiento: no está unida a ninguno");
  if (t.assignees === 0) gaps.push("Responsable: no tiene");
  if (t.type === "QA" && t.reviewers === 0) gaps.push("Revisores: no tiene quién la revise");
  if (DESIGN_TYPES.includes(t.type) && t.designItems === 0) gaps.push(t.type === "ADJUSTMENT" ? "Ítems de ajuste: no tiene ninguno" : "Pruebas: no tiene ninguna");
  if (t.projectUsesTags && t.tags === 0) gaps.push("Etiquetas: no tiene, y el proyecto las usa");
  return gaps;
}

export type ClientFacts = { logoUrl: string | null; contactName: string | null; contactEmail: string | null; contactPhone: string | null; website: string | null; profile: string | null };

export function clientCoverage(c: ClientFacts | null): Set<string> {
  const done = new Set<string>();
  if (!c) return done;
  done.add("name");
  if (c.profile?.trim()) {
    done.add("business");
    done.add("expectations");
  }
  if (c.contactName || c.contactEmail || c.contactPhone) done.add("contact");
  return done;
}

export function clientGaps(c: ClientFacts): string[] {
  const gaps: string[] = [];
  if (!c.profile?.trim()) gaps.push("Perfil: está vacío (a qué se dedica, qué espera, cómo es trabajar con él)");
  else if (c.profile.trim().length < 200) gaps.push("Perfil: es muy corto");
  if (!c.contactName) gaps.push("Persona de contacto: no tiene");
  if (!c.contactEmail && !c.contactPhone) gaps.push("Correo o teléfono: no tiene");
  if (!c.website) gaps.push("Sitio web o redes: no tiene");
  if (!c.logoUrl) gaps.push("Logo: no tiene");
  return gaps;
}
