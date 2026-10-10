import { prisma } from "@/lib/prisma";
import { visibleProjectWhere, type Actor } from "@/lib/permissions";
import { credentialVisibleWhere } from "@/lib/credentials";
import { CREDENTIAL_MIME_TYPE, LINK_MIME_TYPE, credentialRef, linkKey, repoLinkName } from "@/lib/attachments";

export type MediaItem = { url: string; name: string; mimeType: string };

/**
 * Proyectos cuyos archivos comparte la Galería (spec 004): el propio y el resto de su grupo —
 * principal y todos sus subproyectos—, solo los que esta persona puede ver (ocultos ajenos y
 * archivados quedan fuera). El propio va siempre: quien llegó acá ya pasó su chequeo de permiso.
 */
async function galleryProjectIds(projectId: string, parentId: string | null, actor: Actor) {
  const rootId = parentId ?? projectId;
  const others = await prisma.project.findMany({
    where: { AND: [{ OR: [{ id: rootId }, { parentId: rootId }] }, { id: { not: projectId } }, visibleProjectWhere(actor)] },
    select: { id: true },
  });
  return [projectId, ...others.map((p) => p.id)];
}

/**
 * Todo lo ya subido (archivos y links) en el proyecto y su grupo — adjuntos de sus tareas,
 * archivos y enlaces de Definición, ajustes, entregas y evidencias de pruebas, repositorios —
 * sin repetir el mismo archivo físico, de lo más reciente a lo más antiguo. Contraseñas (solo si
 * `withCredentials`, y las que esta persona puede ver): las del propio proyecto y, en un
 * subproyecto, también las de su principal — nunca las de los hermanos ni, en el principal,
 * las de sus subproyectos.
 * Sin chequeo de permiso: lo hace quien la llama (mediaGallery.ts, internalMessageActions.ts).
 */
export async function projectMedia(projectId: string, actor: Actor, { withCredentials = true } = {}): Promise<MediaItem[]> {
  const { parentId } = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { parentId: true } });
  const ids = await galleryProjectIds(projectId, parentId, actor);
  const inGroup = { in: ids };
  const fileSelect = { fileUrl: true, fileName: true, mimeType: true, uploadedAt: true } as const;
  const [attachments, projectAttachments, links, adjustmentFiles, deliverables, evidence, projects, credentials] = await Promise.all([
    prisma.attachment.findMany({ where: { task: { projectId: inGroup } }, select: fileSelect }),
    prisma.projectAttachment.findMany({ where: { projectId: inGroup }, select: fileSelect }),
    prisma.projectLink.findMany({ where: { projectId: inGroup }, select: { url: true, title: true, createdAt: true } }),
    prisma.adjustmentAttachment.findMany({ where: { adjustmentItem: { task: { projectId: inGroup } } }, select: fileSelect }),
    prisma.reviewDeliverable.findMany({ where: { reviewRound: { task: { projectId: inGroup } } }, select: fileSelect }),
    prisma.reviewCheckEvidence.findMany({ where: { reviewCheck: { reviewRound: { task: { projectId: inGroup } } } }, select: fileSelect }),
    prisma.project.findMany({ where: { id: inGroup }, select: { repoUrl: true, createdAt: true, repos: { select: { url: true, createdAt: true } } } }),
    withCredentials
      ? prisma.credential.findMany({ where: { projectId: { in: parentId ? [projectId, parentId] : [projectId] }, ...credentialVisibleWhere(actor) }, select: { id: true, name: true, createdAt: true } })
      : Promise.resolve([]),
  ]);
  // Repositorios (principal + adicionales de cada proyecto), con el mismo nombre que en la vista Archivos.
  const repos = projects
    .flatMap((p) => [...(p.repoUrl ? [{ url: p.repoUrl, createdAt: p.createdAt }] : []), ...p.repos])
    .filter((r, i, all) => all.findIndex((x) => x.url === r.url) === i);
  // Archivos y links mezclados; un archivo usado en varios lugares aparece una vez, en la posición de su uso más reciente.
  const all = [
    ...attachments,
    ...projectAttachments,
    ...adjustmentFiles,
    ...deliverables,
    ...evidence,
    ...links.map((l) => ({ fileUrl: l.url, fileName: l.title, mimeType: LINK_MIME_TYPE, uploadedAt: l.createdAt })),
    ...repos.map((r, i) => ({ fileUrl: r.url, fileName: repoLinkName(r.url, i, repos.length), mimeType: LINK_MIME_TYPE, uploadedAt: r.createdAt })),
    ...credentials.map((c) => ({ fileUrl: credentialRef(c.id), fileName: c.name, mimeType: CREDENTIAL_MIME_TYPE, uploadedAt: c.createdAt })),
  ].sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
  const seen = new Set<string>();
  const items: MediaItem[] = [];
  for (const a of all) {
    if (seen.has(linkKey(a.fileUrl))) continue;
    seen.add(linkKey(a.fileUrl));
    items.push({ url: a.fileUrl, name: a.fileName, mimeType: a.mimeType });
  }
  return items;
}
