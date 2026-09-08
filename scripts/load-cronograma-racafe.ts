import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

// Carga el cronograma real de Documentacion/Insumos/Cronograma_Racafe.xlsx
// (hoja "Cronograma") usando la API pública documentada en
// .claude/skills/project-manager-sk/SKILL.md. Idempotente: si el proyecto ya
// existe (por nombre) no lo duplica.

const BASE_URL = "http://localhost:3000";
const API_KEY = process.env.API_KEY;
if (!API_KEY) throw new Error("Falta API_KEY en .env");

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
      ...init?.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`${init?.method ?? "GET"} ${path} -> ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

// Personas reales del equipo (hoja "Equipo"). "Cliente", "Sistemas Racafé",
// "Diseñador" y "Consultor Externo" figuran como "Por definir" o son
// entidades externas sin cuenta en el sistema: las tareas donde son el único
// responsable quedan asignadas a Elan (líder de proyecto) como dueño interno.
const TEAM_SEED = [
  { key: "max", name: "Max", email: "max@equipo.local" },
  { key: "nata", name: "Nata", email: "nata@equipo.local" },
  { key: "david", name: "David Hoyos", email: "david.hoyos@equipo.local" },
] as const;

const PHASES = [
  "Fase 1 — Definición técnica y diseño",
  "Fase 2 — Desarrollo por bloques",
  "Fase 3 — Refinamiento",
  "Fase 4 — Cierre y despliegue",
];

type Assignee = "elan" | "max" | "nata" | "david";
type TaskDef = {
  id: string;
  phase: number;
  title: string;
  type: "SIMPLE" | "MEETING" | "ADJUSTMENT" | "QA" | "MILESTONE";
  start: string;
  days: number;
  assignees: Assignee[];
  deps?: string[];
};

const TASKS: TaskDef[] = [
  { id: "1.1", phase: 0, title: "Kickoff y definición técnica final (plataforma, accesos Racafé)", type: "MEETING", start: "2026-08-27", days: 3, assignees: ["elan"] },
  { id: "1.2", phase: 0, title: "Diseño UX/UI — propuesta inicial (Figma, sistema de navegación)", type: "SIMPLE", start: "2026-09-01", days: 5, assignees: ["elan"], deps: ["1.1"] },
  { id: "1.3", phase: 0, title: "Revisión de diseño — Ronda 1 (Cliente / David Hoyos)", type: "MEETING", start: "2026-09-08", days: 1, assignees: ["david"], deps: ["1.2"] },
  { id: "1.4", phase: 0, title: "Ajustes de diseño — Ronda 1", type: "ADJUSTMENT", start: "2026-09-09", days: 2, assignees: ["elan"], deps: ["1.3"] },
  { id: "1.5", phase: 0, title: "Revisión de diseño — Ronda 2 (Cliente)", type: "MEETING", start: "2026-09-11", days: 1, assignees: ["david"], deps: ["1.4"] },
  { id: "1.6", phase: 0, title: "Ajustes finales y aprobación de diseño", type: "ADJUSTMENT", start: "2026-09-14", days: 1, assignees: ["elan"], deps: ["1.5"] },
  { id: "1.7", phase: 0, title: "Setup técnico: repositorio, ambientes de prueba, estructura base (Flexible Content / Layout Builder)", type: "SIMPLE", start: "2026-09-01", days: 8, assignees: ["max", "nata"] },
  { id: "1.8", phase: 0, title: "Consultoría externa: recomendaciones de arquitectura y seguridad", type: "SIMPLE", start: "2026-09-01", days: 3, assignees: ["elan"] },
  { id: "1.9", phase: 0, title: "Elaboración del entregable: paquete de diseño aprobado + base técnica lista", type: "SIMPLE", start: "2026-09-15", days: 1, assignees: ["elan"], deps: ["1.6", "1.7", "1.8"] },
  { id: "H1", phase: 0, title: "HITO · Diseño aprobado y base técnica lista", type: "MILESTONE", start: "2026-09-15", days: 1, assignees: ["elan"], deps: ["1.9"] },

  { id: "2.1.1", phase: 1, title: "Sprint 1 — Desarrollo: Home (landing con los 3 temas + selector)", type: "SIMPLE", start: "2026-09-16", days: 5, assignees: ["max", "elan"], deps: ["H1"] },
  { id: "2.1.2", phase: 1, title: "QA continua — Sprint 1", type: "QA", start: "2026-09-16", days: 5, assignees: ["nata"] },
  { id: "2.2.1", phase: 1, title: "Sprint 2 — Desarrollo: 3 secciones por tipo de cliente", type: "SIMPLE", start: "2026-09-23", days: 8, assignees: ["max", "elan"], deps: ["2.1.1"] },
  { id: "2.2.2", phase: 1, title: "QA continua — Sprint 2", type: "QA", start: "2026-09-23", days: 8, assignees: ["nata"] },
  { id: "2.3.1", phase: 1, title: "Sprint 3 — Desarrollo: sección Contacto (formulario + integración CRM)", type: "SIMPLE", start: "2026-10-05", days: 5, assignees: ["max"], deps: ["2.2.1"] },
  { id: "2.3.2", phase: 1, title: "QA continua — Sprint 3", type: "QA", start: "2026-10-05", days: 5, assignees: ["nata"] },
  { id: "2.4.1", phase: 1, title: "Sprint 4 — Desarrollo: landing Crecer", type: "SIMPLE", start: "2026-10-13", days: 7, assignees: ["max", "elan"], deps: ["2.3.1"] },
  { id: "2.4.2", phase: 1, title: "QA continua — Sprint 4", type: "QA", start: "2026-10-13", days: 7, assignees: ["nata"] },
  { id: "2.5", phase: 1, title: "Elaboración del entregable: sitio funcional en ambiente de pruebas", type: "SIMPLE", start: "2026-10-22", days: 1, assignees: ["max", "elan"], deps: ["2.4.1", "2.4.2"] },
  { id: "H2", phase: 1, title: "HITO · Desarrollo funcional completo", type: "MILESTONE", start: "2026-10-22", days: 1, assignees: ["elan"], deps: ["2.5"] },

  { id: "3.1", phase: 2, title: "Refinamiento visual e interacción (microinteracciones, ajustes post-QA)", type: "ADJUSTMENT", start: "2026-10-23", days: 5, assignees: ["elan", "max"], deps: ["H2"] },
  { id: "3.2", phase: 2, title: "Revisión bilingüe ES/EN", type: "QA", start: "2026-10-30", days: 3, assignees: ["nata"], deps: ["3.1"] },
  { id: "3.3", phase: 2, title: "Verificación de tracking (UTM, GA4, Meta Pixel, Google Pixel)", type: "QA", start: "2026-10-30", days: 3, assignees: ["nata"] },

  { id: "4.1", phase: 3, title: "Pruebas de aceptación integrales", type: "QA", start: "2026-11-05", days: 4, assignees: ["nata"], deps: ["3.2", "3.3"] },
  { id: "4.2", phase: 3, title: "Corrección de hallazgos", type: "ADJUSTMENT", start: "2026-11-11", days: 3, assignees: ["max", "elan"], deps: ["4.1"] },
  { id: "4.3", phase: 3, title: "Validación final TI Racafé + aprobación cliente", type: "MEETING", start: "2026-11-17", days: 2, assignees: ["david"], deps: ["4.2"] },
  { id: "4.4", phase: 3, title: "Despliegue a producción + capacitación", type: "SIMPLE", start: "2026-11-19", days: 2, assignees: ["max", "elan"], deps: ["4.3"] },
  { id: "4.5", phase: 3, title: "Elaboración del entregable: sitio en producción, entrega final al cliente", type: "SIMPLE", start: "2026-11-23", days: 1, assignees: ["max", "elan"], deps: ["4.4"] },
  { id: "H3", phase: 3, title: "HITO · Lanzamiento", type: "MILESTONE", start: "2026-11-23", days: 1, assignees: ["elan"], deps: ["4.5"] },
];

async function main() {
  const elan = await prisma.user.findUniqueOrThrow({ where: { email: "ecovia2@gmail.com" } });

  const userIds: Record<Assignee, string> = { elan: elan.id, max: "", nata: "", david: "" };
  for (const member of TEAM_SEED) {
    const passwordHash = await bcrypt.hash("cambiar-esta-clave", 10);
    const user = await prisma.user.upsert({
      where: { email: member.email },
      update: {},
      create: { name: member.name, email: member.email, passwordHash, role: "MEMBER" },
    });
    userIds[member.key] = user.id;
  }

  const projectName = "Reconversión racafe.com.co";
  const existing = (await api("/api/v1/projects")) as { id: string; name: string }[];
  let projectId = existing.find((p) => p.name === projectName)?.id;

  if (!projectId) {
    const project = (await api("/api/v1/projects", {
      method: "POST",
      body: JSON.stringify({
        name: projectName,
        clientName: "Racafé",
        countryCode: "CO",
        startDate: "2026-08-27",
        pmId: elan.id,
      }),
    })) as { id: string };
    projectId = project.id;

    // La API pública crea una fase "General" por defecto; el cronograma real
    // usa 4 fases con nombre propio, así que se reemplaza directo por Prisma
    // (no hay endpoint público de fases documentado en el skill).
    await prisma.phase.deleteMany({ where: { projectId, name: "General" } });
    console.log(`Proyecto creado: ${projectId}`);
  } else {
    console.log(`Proyecto ya existía: ${projectId} (no se duplica)`);
  }

  const phaseIds = (await prisma.phase.findMany({ where: { projectId }, orderBy: { order: "asc" } })).map((p) => p.name);
  if (phaseIds.length === 0) {
    for (const [order, name] of PHASES.entries()) {
      await prisma.phase.create({ data: { projectId, name, order } });
    }
  }
  const phases = await prisma.phase.findMany({ where: { projectId }, orderBy: { order: "asc" } });

  const existingTasks = (await api(`/api/v1/projects/${projectId}/tasks`)) as { id: string; title: string }[];
  const taskIdByManuscriptId: Record<string, string> = {};

  for (const t of TASKS) {
    const already = existingTasks.find((e) => e.title === t.title);
    if (already) {
      taskIdByManuscriptId[t.id] = already.id;
      continue;
    }
    const created = (await api(`/api/v1/projects/${projectId}/tasks`, {
      method: "POST",
      body: JSON.stringify({
        phaseId: phases[t.phase].id,
        title: t.title,
        type: t.type,
        plannedStart: t.start,
        durationDays: t.days,
        assigneeIds: t.assignees.map((a) => userIds[a]),
        dependsOnTaskIds: t.deps?.map((d) => taskIdByManuscriptId[d]),
      }),
    })) as { id: string };
    taskIdByManuscriptId[t.id] = created.id;
    console.log(`Tarea creada: ${t.id} — ${t.title}`);
  }

  console.log(`Listo: ${Object.keys(taskIdByManuscriptId).length} tareas en el proyecto ${projectId}.`);
}

main()
  .catch((err) => {
    console.error("FALLÓ:", err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
