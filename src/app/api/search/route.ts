import { NextResponse } from "next/server";
import { visibleProjectWhere, LIVE_PROJECT_WHERE, managedProjectWhere } from "@/lib/permissions";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { RELATIVE_SCORE_CUTOFF, fuzzyScore, weightedScore } from "@/lib/fuzzy";
import { parseHeaderSearch } from "@/lib/search";
import { commentPreview } from "@/lib/commentBody";
import { CREDENTIAL_MIME_TYPE, LINK_MIME_TYPE } from "@/lib/attachments";
import { credentialVisibleWhere } from "@/lib/credentials";
import { TASK_STATUS_LABEL, TASK_TYPE_LABEL } from "@/lib/statusColors";
import { tagLabel } from "@/lib/tagFilter";
import type { Prisma, TaskStatus } from "@prisma/client";

// Los resultados se muestran agrupados y en este orden: Proyectos → Tareas
// (con sus pasos) → Comentarios → Archivos (con los links).
export type SearchGroup = "project" | "task" | "comment" | "file";

export type SearchHit = {
  kind: "project" | "task" | "step" | "comment" | "file" | "link" | "credential";
  group: SearchGroup;
  id: string;
  title: string;
  context: string | null;
  href: string;
  score: number;
  // Logo del proyecto (solo en resultados de proyecto y tarea): nombre para el respaldo con inicial + imagen si tiene.
  project?: { name: string; iconUrl: string | null; parent?: { name: string; iconUrl: string | null } | null };
  // Involucrados de un comentario: autor primero y luego las personas @mencionadas.
  people?: { name: string; avatarUrl: string | null }[];
  // Solo en resultados de tarea: tipo y estado (el cliente los traduce a etiqueta y color).
  taskType?: string;
  taskStatus?: TaskStatus;
  // Archivos, links y contraseñas: el buscador los abre en su visor (como AttachmentGrid) en vez de navegar.
  preview?: { url: string; mimeType: string };
  siteUrl?: string | null;
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
  const { filter, text: searchText } = parseHeaderSearch(q);
  const credentialsOnly = filter === "credential";
  // «tipos:», «estados:» y «etiquetas:» traen tareas, buscadas por su tipo, su estado o sus etiquetas en vez de por su texto.
  const byTypeOrStatus = filter === "taskType" || filter === "taskStatus";
  const hitKind = byTypeOrStatus || filter === "tag" ? "task" : filter;
  // Por etiqueta siempre viajan las categorías: el buscador las sugiere mientras se escribe.
  const categories = filter === "tag" ? await prisma.tagCategory.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, emoji: true, colorHex: true } }) : undefined;
  // Sin texto todavía: el buscador ofrece los tipos y estados (los conoce) o las categorías de etiqueta para elegir.
  if (hitKind === "task" && filter !== "task" && !searchText) return NextResponse.json({ hits: [] satisfies SearchHit[], categories });

  // Buscar «contraseña(s)» o «clave(s)» trae todas las contraseñas que la persona puede ver, primero y sin
  // tope. No hace falta escribirla exacta: desde 4 letras vale el comienzo («contra», «clav») o un error de
  // tipeo («contrasena», «calve»); con dos errores ya no, para no confundirla con «contrato».
  const allCredentials = credentialsOnly
    ? !searchText
    : q.length >= 4 && !/\s/.test(q) && fuzzyScore(q, "contraseña contraseñas clave claves") >= 0.5;
  // «etiquetas:Categoría:nombre» — antes de los dos puntos la categoría y después el nombre (cualquiera
  // de los dos puede ir vacío). Sin dos puntos, el texto se busca en «Categoría | nombre» completo.
  // «tipos:Tipo:texto» / «estados:Estado:texto» — igual: antes de los dos puntos el tipo o el estado y después lo que se busca dentro de sus tareas.
  const colon = filter === "tag" || byTypeOrStatus ? searchText.indexOf(":") : -1;
  const typeOrStatusText = byTypeOrStatus ? (colon < 0 ? searchText : searchText.slice(0, colon)).trim() : "";
  // Lo que se compara contra el texto de cada resultado.
  const needle = byTypeOrStatus ? (colon < 0 ? "" : searchText.slice(colon + 1).trim()) : searchText;
  const tagCategoryText = colon < 0 ? null : searchText.slice(0, colon).trim();
  // «etiquetas:categoría:etiqueta:texto» — lo que va después de un tercer «:» se busca en el contenido
  // (título + descripción) de las tareas con esa etiqueta. Con un espacio justo después de
  // «categoría:» («etiquetas:capacitación: figma») se salta la etiqueta y se busca directo en el contenido
  // de las tareas de la categoría. Si lo escrito como etiqueta no es ninguna de esa categoría, también.
  const tagRest = filter === "tag" && colon >= 0 ? searchText.slice(colon + 1) : null;
  const restColon = tagRest?.indexOf(":") ?? -1;
  const rawTagName = tagRest === null ? null : restColon < 0 ? tagRest : tagRest.slice(0, restColon);
  let tagContentText = tagRest !== null && restColon >= 0 ? tagRest.slice(restColon + 1).trim() : "";
  let tagNameText = rawTagName === null ? null : rawTagName.trim();
  if (rawTagName !== null && /^\s/.test(rawTagName)) {
    tagContentText = [rawTagName.trim(), tagContentText].filter(Boolean).join(" ");
    tagNameText = "";
  }
  const matchesTag = (category: { name: string; emoji: string | null }, name: string) =>
    tagCategoryText === null || tagNameText === null
      ? fuzzyScore(searchText, tagLabel(category, name)) > 0
      : (!tagCategoryText || fuzzyScore(tagCategoryText, category.name) > 0) && (!tagNameText || fuzzyScore(tagNameText, name) > 0);
  const userId = session.user.id;
  const projectWhere: Prisma.ProjectWhereInput =
    session.user.role === "ADMIN"
      ? visibleProjectWhere(session.user)
      : {
          ...LIVE_PROJECT_WHERE,
          hidden: false,
          OR: [
            ...managedProjectWhere(userId).OR,
            { tasks: { some: { OR: [{ assignees: { some: { userId } } }, { reviewers: { some: { userId } } }] } } },
          ],
        };

  const projects = credentialsOnly ? [] : await prisma.project.findMany({
    where: projectWhere,
    select: {
      id: true,
      name: true,
      clientName: true,
      description: true,
      iconUrl: true,
      parent: { select: { name: true, iconUrl: true } },
      pm: { select: { name: true, avatarUrl: true } },
      // Roles del equipo en el proyecto (informativos): entran con peso bajo al texto de sus tareas.
      roles: { select: { role: true, user: { select: { name: true, cargo: true } } } },
      links: { select: { id: true, title: true, url: true } },
      attachments: { select: { id: true, fileName: true, fileUrl: true, mimeType: true, uploadedBy: { select: { name: true, avatarUrl: true } } } },
      tasks: {
        select: {
          id: true,
          title: true,
          description: true,
          type: true,
          status: true,
          steps: { select: { id: true, description: true } },
          taskTags: { select: { tag: { select: { name: true, category: { select: { name: true, emoji: true } } } } } },
          assignees: { select: { user: { select: { name: true, avatarUrl: true } } } },
          reviewers: { select: { user: { select: { name: true, avatarUrl: true } } } },
          attachments: { select: { id: true, fileName: true, fileUrl: true, mimeType: true, uploadedBy: { select: { name: true, avatarUrl: true } } } },
        },
      },
    },
  });
  // Lo escrito como etiqueta no coincide con ninguna de la categoría (en lo que la persona ve): es texto a buscar en las tareas.
  if (tagCategoryText !== null && tagNameText) {
    const anyTag = projects.some((p) => p.tasks.some((t) => t.taskTags.some(({ tag }) => matchesTag(tag.category, tag.name))));
    if (!anyTag) {
      tagContentText = [tagNameText, tagContentText].filter(Boolean).join(" ");
      tagNameText = "";
    }
  }
  const projectIds = projects.map((p) => p.id);
  const messages = filter && filter !== "comment" ? [] : await prisma.internalMessage.findMany({
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
  const push = (kind: SearchHit["kind"], id: string, title: string, context: string | null, href: string, text: string, project?: SearchHit["project"], people?: SearchHit["people"], extra?: Pick<SearchHit, "taskType" | "taskStatus" | "preview" | "siteUrl">, contextText = "") => {
    if (hitKind && kind !== hitKind) return;
    // Por etiqueta ya llegan solo las tareas que coinciden (matchesTag).
    // Con pesos (weightedScore): el título cuenta más que la descripción, y esta más que el contexto
    // (nombre del proyecto de la tarea); la frase completa suma.
    const score = filter === "tag" ? (tagContentText ? weightedScore(tagContentText, title, text, contextText) : 1) : filter && !needle ? 1 : weightedScore(needle, title, text, contextText);
    const group: SearchGroup = kind === "step" ? "task" : kind === "link" || kind === "credential" ? "file" : kind;
    if (score > 0) hits.push({ kind, group, id, title, context, href, score, project, people, ...extra });
  };

  const taskTitleById = new Map<string, string>();
  // «etiquetas:categoría:…»: nombres de etiqueta de esa categoría que la persona puede ver, para sugerirlos.
  const tagNames = new Set<string>();
  for (const p of projects) {
    const logo = { name: p.name, iconUrl: p.iconUrl, parent: p.parent };
    push("project", p.id, p.name, p.clientName, `/projects/${p.id}`, `${p.name} ${p.clientName ?? ""} ${stripHtml(p.description ?? "")}`, logo, [p.pm]);
    for (const l of p.links) push("link", l.id, l.title, p.name, `/projects/${p.id}?view=definition`, `${l.title} ${l.url}`, logo, undefined, { preview: { url: l.url, mimeType: LINK_MIME_TYPE } });
    for (const a of p.attachments) {
      const isLink = a.mimeType === LINK_MIME_TYPE;
      push(isLink ? "link" : "file", a.id, a.fileName, p.name, `/projects/${p.id}?view=definition`, a.fileName, logo, a.uploadedBy ? [a.uploadedBy] : undefined, { preview: { url: a.fileUrl, mimeType: a.mimeType } });
    }
    for (const t of p.tasks) {
      taskTitleById.set(t.id, t.title);
      const taskHref = `/projects/${p.id}/tasks/${t.id}`;
      const involved = [...t.assignees, ...t.reviewers].map((x) => x.user).filter((u, i, all) => all.findIndex((v) => v.name === u.name) === i);
      // Por etiqueta: categoría y nombre tienen que coincidir en UNA misma etiqueta, no entre dos distintas.
      if (tagCategoryText !== null) {
        for (const { tag } of t.taskTags) if (tag.name && (!tagCategoryText || fuzzyScore(tagCategoryText, tag.category.name) > 0)) tagNames.add(tag.name);
      }
      const tags = t.taskTags
        .filter((tt) => filter !== "tag" || matchesTag(tt.tag.category, tt.tag.name))
        .map((tt) => tagLabel(tt.tag.category, tt.tag.name))
        .join(", ");
      const typeMatches =
        filter === "taskType" ? fuzzyScore(typeOrStatusText, TASK_TYPE_LABEL[t.type] ?? t.type) > 0
        : filter === "taskStatus" ? fuzzyScore(typeOrStatusText, TASK_STATUS_LABEL[t.status]) > 0
        : true;
      if (typeMatches && (filter !== "tag" || tags)) {
        const taskText = filter === "tag" && !tagContentText ? tags : `${t.title} ${stripHtml(t.description ?? "")}`;
        // El proyecto (y su principal, si es subproyecto) entra con peso bajo para rastrear la tarea por él.
        // El equipo y sus roles también: buscar «diseñador» encuentra las tareas del proyecto donde esa
        // persona tiene ese rol, sin competir con el título ni la descripción.
        const projectText = `${p.parent?.name ?? ""} ${p.name} ${p.clientName ?? ""}`;
        const teamText = p.roles.map((r) => `${r.user.name} ${r.user.cargo ?? ""} ${r.role}`).join(" ");
        push("task", t.id, t.title, filter === "tag" ? `${tags} · ${p.name}` : p.name, taskHref, taskText, logo, involved, { taskType: t.type, taskStatus: t.status }, `${projectText} ${teamText}`);
      }
      for (const s of t.steps) push("step", s.id, snippet(s.description.replace(/\*([^*\n]+)\*/g, "$1")), `${t.title} · ${p.name}`, taskHref, s.description, logo, involved);
      for (const a of t.attachments) {
        const isLink = a.mimeType === LINK_MIME_TYPE;
        push(isLink ? "link" : "file", a.id, a.fileName, `${t.title} · ${p.name}`, taskHref, isLink ? `${a.fileName} ${a.fileUrl}` : a.fileName, logo, [...(a.uploadedBy ? [a.uploadedBy] : []), ...involved].filter((u, i, all) => all.findIndex((v) => v.name === u.name) === i), { preview: { url: a.fileUrl, mimeType: a.mimeType } });
      }
    }
  }
  // Credenciales: solo las que esta persona puede ver; se busca por nombre, URL, usuario y notas (nunca por
  // la contraseña, que además está cifrada).
  const credentials = filter && !credentialsOnly ? [] : await prisma.credential.findMany({
    where: { AND: [credentialVisibleWhere(session.user), { project: LIVE_PROJECT_WHERE }] },
    select: { id: true, name: true, url: true, username: true, notes: true, project: { select: { name: true, iconUrl: true, parent: { select: { name: true, iconUrl: true } } } } },
  });
  for (const c of credentials) {
    push("credential", c.id, c.name, c.project.name, `/credentials/${c.id}`, `${c.name} ${c.url ?? ""} ${c.username ?? ""} ${c.notes ?? ""}${allCredentials && !credentialsOnly ? ` ${q}` : ""}`, { name: c.project.name, iconUrl: c.project.iconUrl, parent: c.project.parent }, undefined, { siteUrl: c.url, preview: { url: `credential:${c.id}`, mimeType: CREDENTIAL_MIME_TYPE } });
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
      proj && { name: proj.name, iconUrl: proj.iconUrl, parent: proj.parent },
      [m.author, ...m.mentions.map((x) => x.user).filter((u) => u.name !== m.author.name)]
    );
  }

  // Un tope por grupo (en vez de uno global) para que los comentarios, que
  // suelen ser muchos, no desplacen a los proyectos/tareas. Dentro del grupo:
  // primero lo principal (tarea, archivo) y después lo secundario (paso, link);
  // luego por coincidencia.
  const LIMIT: Record<SearchGroup, number> = { project: 5, task: 8, comment: 8, file: 8 };
  const secondary = (h: SearchHit) => (allCredentials && h.kind === "credential" ? -1 : h.kind === "step" || h.kind === "link" ? 1 : 0);
  const credentialHits = allCredentials || credentialsOnly ? hits.filter((h) => h.kind === "credential").length : 0;
  // Dentro de cada grupo quedan solo los que se acercan al mejor puntaje: si una tarea trae la frase
  // exacta en el título, las que solo coinciden a medias en la descripción no la tapan.
  const keepsUp = (h: SearchHit, best: number) => (allCredentials && h.kind === "credential") || h.score >= best * RELATIVE_SCORE_CUTOFF;
  const ordered = (Object.keys(LIMIT) as SearchGroup[]).flatMap((group) => {
    const inGroup = hits.filter((h) => h.group === group);
    const best = Math.max(0, ...inGroup.map((h) => h.score));
    return inGroup
      .filter((h) => keepsUp(h, best))
      .sort((a, b) => secondary(a) - secondary(b) || b.score - a.score)
      .slice(0, filter ? undefined : LIMIT[group] + (group === "file" ? credentialHits : 0));
  });
  const tagNameChoices = tagCategoryText === null ? undefined : { category: tagCategoryText, names: [...tagNames].sort((a, b) => a.localeCompare(b, "es")).slice(0, 40) };
  return NextResponse.json({ hits: ordered, categories, tagNames: tagNameChoices });
}
