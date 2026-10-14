// Portada de una tarea (imagen de la card, como Trello). Regla única para el tablero,
// los popups de Gantt/Calendario, el buscador, la API y el bot:
// «Sin portada» → ninguna; si no, la imagen elegida; si no hay elegida (o ya se
// borró), la primera imagen adjunta a la tarea (insumos y resultados).

type CoverAttachment = { id: string; fileUrl: string; mimeType: string; uploadedAt: Date };

export function taskCoverImages<A extends CoverAttachment>(attachments: A[]): A[] {
  return attachments
    .filter((a) => a.mimeType.startsWith("image/"))
    .sort((a, b) => a.uploadedAt.getTime() - b.uploadedAt.getTime());
}

export function taskCoverUrl(task: { coverAttachmentId: string | null; coverHidden: boolean; attachments: CoverAttachment[] }): string | null {
  if (task.coverHidden) return null;
  const images = taskCoverImages(task.attachments);
  return (images.find((a) => a.id === task.coverAttachmentId) ?? images[0])?.fileUrl ?? null;
}
