import { prisma } from "@/lib/prisma";
import { normalizeSearchText } from "@/lib/search";
import { businessDaysBetween } from "@/lib/holidays";
import { getAccessibleProjectIds } from "@/lib/chontatecTools";

const STOP = new Set(["para", "proyecto", "sitio", "pagina", "desde", "sobre", "entre", "como", "este", "esta", "todo", "todos", "nuevo", "nueva"]);

function words(text: string): Set<string> {
  return new Set(normalizeSearchText(text.replace(/<[^>]+>/g, " ")).split(/[^a-z0-9ñ]+/).filter((w) => w.length >= 4 && !STOP.has(w)));
}

export function similarityScore(target: { clientId: string | null; text: string }, candidate: { clientId: string | null; text: string }): number {
  const a = words(target.text);
  const shared = [...words(candidate.text)].filter((w) => a.has(w)).length;
  return (target.clientId && target.clientId === candidate.clientId ? 3 : 0) + shared;
}

export async function similarProjects(userId: string, target: { projectId?: string | null; clientId: string | null; text: string }, limit = 3) {
  const accessible = await getAccessibleProjectIds(userId);
  const candidates = await prisma.project.findMany({
    where: { status: { not: "ARCHIVED" }, ...(accessible ? { id: { in: accessible } } : {}), ...(target.projectId ? { NOT: { id: target.projectId } } : {}) },
    select: { id: true, name: true, description: true, clientId: true, clientName: true, countryCode: true, archivedAt: true },
  });
  const ranked = candidates
    .map((p) => ({ p, score: similarityScore(target, { clientId: p.clientId, text: `${p.name} ${p.description ?? ""}` }) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return Promise.all(
    ranked.map(async ({ p }) => {
      const phases = await prisma.phase.findMany({
        where: { projectId: p.id },
        orderBy: { order: "asc" },
        select: { name: true, tasks: { select: { title: true, type: true, plannedStart: true, plannedEnd: true, actualStart: true, actualEnd: true, _count: { select: { reviewRounds: true } } } } },
      });
      const phaseInfo = await Promise.all(
        phases
          .filter((ph) => ph.tasks.length > 0)
          .map(async (ph) => {
            const starts = ph.tasks.map((t) => (t.actualStart ?? t.plannedStart).getTime());
            const ends = ph.tasks.map((t) => (t.actualEnd ?? t.plannedEnd).getTime());
            return {
              phase: ph.name,
              tasks: ph.tasks.map((t) => t.title).slice(0, 15),
              businessDays: await businessDaysBetween(p.countryCode, new Date(Math.min(...starts)), new Date(Math.max(...ends))),
              testRounds: ph.tasks.filter((t) => t.type === "QA").reduce((n, t) => n + t._count.reviewRounds, 0),
            };
          })
      );
      return { name: p.name, client: p.clientName, archived: Boolean(p.archivedAt), phases: phaseInfo };
    })
  );
}
