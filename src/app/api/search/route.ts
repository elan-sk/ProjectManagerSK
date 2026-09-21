import { NextResponse } from "next/server";
import { visibleProjectWhere } from "@/lib/permissions";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { fuzzyScore } from "@/lib/fuzzy";
import { commentPreview } from "@/lib/commentBody";
import { LINK_MIME_TYPE } from "@/lib/attachments";
import type { Prisma } from "@prisma/client";

// Los resultados se muestran agrupados y en este orden: Proyectos → Tareas
// (con sus pasos) → Comentarios → Archivos (con los links).
export type SearchGroup = "project" | "task" | "comment" | "file";

export type SearchHit = {
  kind: "project" | "task" | "step" | "comment" | "file" | "link";
  group: SearchGroup;
  id: string;
  title: string;
  context: string | null;
  href: string;
  score: number;
  // Logo del proyecto (solo en resultados de proyecto y tarea): nombre para el respaldo con inicial + imagen si tiene.
  project?: { name: string; iconUrl: string | null };
  // Involucrados de un comentario: autor primero y luego las personas @mencionadas.
  people?: { name: string; avatarUrl: string | null }[];
};

const stripHtml = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const snippet = (s: string) => (s.length > 90 ? `${s.slice(0, 90)}…` : s);

// Buscador rápido del header: proyectos, tareas, pasos del checklist,
// comentarios, archivos y links. Cada quien solo encuentra lo que ya puede
// ver (mismo criterio que layout/Agenda): admin todo; el resto, proyectos que
// administra o donde es asignado/revisor de alguna tarea.
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ hits: [] satisfies SearchHit[] });

  const userId = session.user.id;
  const projectWhere: Prisma.ProjectWhereInput =
    session.user.role === "ADMIN"
      ? { status: { not: "ARCHIVED" }, ...visibleProjectWhere(session.user) }
      : {
          status: { not: "ARCHIVED" },
          hidden: false,
          OR: [
            { pmId: userId },
            { tasks: { some: { OR: [{ assignees: { some: { userId } } }, { reviewers: { some: { userId } } }] } } },
          ],
        };

  const projects = await prisma.project.findMany({
    where: projectWhere,
    select: {
      id: true,
      name: true,
      clientName: true,
      iconUrl: true,
      links: { select: { id: true, title: true, url: true } },
      attachments: { select: { id: true, fileName: true, mimeType: true } },
      tasks: {
        select: {
          id: true,
          title: true,
          description: true,
          steps: { select: { id: true, description: true } },
          assignees: { select: { user: { select: { name: true, avatarUrl: true } } } },
          reviewers: { select: { user: { select: { name: true, avatarUrl: true } } } },
          attachments: { select: { id: true, fileName: true, fileUrl: true, mimeType: true } },
        },
      },
    },
  });
  const projectIds = projects.map((p) => p.id);
  const messages = await prisma.internalMessage.findMany({
    where: { projectId: { in: projectIds } },
    select: {
      id: true,
      body: true,
      projectId: true,
      taskId: true,
      author: { select: { name: true, avatarUrl: true } },
      mentions: { select: { user: { select: { name: true, avatarUrl: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 2000, // ponytail: solo los 2000 más recientes; FULLTEXT si hace falta más historia
  });

  const hits: SearchHit[] = [];
  const push = (kind: SearchHit["kind"], id: string, title: string, context: string | null, href: string, text: string, project?: SearchHit["project"], people?: SearchHit["people"]) => {
    const score = fuzzyScore(q, text);
    const group: SearchGroup = kind === "step" ? "task" : kind === "link" ? "file" : kind;
    if (score > 0) hits.push({ kind, group, id, title, context, href, score, project, people });
  };

  const taskTitleById = new Map<string, string>();
  for (const p of projects) {
    const logo = { name: p.name, iconUrl: p.iconUrl };
    push("project", p.id, p.name, p.clientName, `/projects/${p.id}`, `${p.name} ${p.clientName ?? ""}`, logo);
    for (const l of p.links) push("link", l.id, l.title, p.name, `/projects/${p.id}?view=definition`, `${l.title} ${l.url}`);
    for (const a of p.attachments) {
      const isLink = a.mimeType === LINK_MIME_TYPE;
      push(isLink ? "link" : "file", a.id, a.fileName, p.name, `/projects/${p.id}?view=definition`, a.fileName);
    }
    for (const t of p.tasks) {
      taskTitleById.set(t.id, t.title);
      const taskHref = `/projects/${p.id}/tasks/${t.id}`;
      const involved = [...t.assignees, ...t.reviewers].map((x) => x.user).filter((u, i, all) => all.findIndex((v) => v.name === u.name) === i);
      push("task", t.id, t.title, p.name, taskHref, `${t.title} ${stripHtml(t.description ?? "")}`, logo, involved);
      for (const s of t.steps) push("step", s.id, snippet(s.description), `${t.title} · ${p.name}`, taskHref, s.description);
      for (const a of t.attachments) {
        const isLink = a.mimeType === LINK_MIME_TYPE;
        push(isLink ? "link" : "file", a.id, a.fileName, `${t.title} · ${p.name}`, taskHref, isLink ? `${a.fileName} ${a.fileUrl}` : a.fileName);
      }
    }
  }
  const projectById = new Map(projects.map((p) => [p.id, p]));
  for (const m of messages) {
    const body = commentPreview(stripHtml(m.body));
    const proj = projectById.get(m.projectId);
    const where = m.taskId ? taskTitleById.get(m.taskId) ?? "Tarea" : "Proyecto";
    push(
      "comment",
      m.id,
      snippet(body),
      `${m.author.name} · ${where} · ${projectById.get(m.projectId)?.name ?? ""}`,
      m.taskId ? `/projects/${m.projectId}/tasks/${m.taskId}` : `/projects/${m.projectId}?view=conversation`,
      body,
      proj && { name: proj.name, iconUrl: proj.iconUrl },
      [m.author, ...m.mentions.map((x) => x.user).filter((u) => u.name !== m.author.name)]
    );
  }

  // Un tope por grupo (en vez de uno global) para que los comentarios, que
  // suelen ser muchos, no desplacen a los proyectos/tareas. Dentro del grupo:
  // primero lo principal (tarea, archivo) y después lo secundario (paso, link);
  // luego por coincidencia.
  const LIMIT: Record<SearchGroup, number> = { project: 5, task: 8, comment: 8, file: 8 };
  const secondary = (h: SearchHit) => (h.kind === "step" || h.kind === "link" ? 1 : 0);
  const ordered = (Object.keys(LIMIT) as SearchGroup[]).flatMap((group) =>
    hits
      .filter((h) => h.group === group)
      .sort((a, b) => secondary(a) - secondary(b) || b.score - a.score)
      .slice(0, LIMIT[group])
  );
  return NextResponse.json({ hits: ordered });
}
