import { z } from "zod";
import { withBody } from "@/lib/apiResult";
import { fileRefSchema } from "@/lib/taskDesign";
import { LINK_MIME_TYPE } from "@/lib/attachments";
import { mimeFromFileName } from "@/lib/uploadFile";
import { submitAcceptanceRound } from "@/app/(app)/projects/[id]/tasks/[taskId]/acceptanceActions";

// Envía (ronda 1) o reenvía (tras una devolución del cliente) la entrega de una tarea de Aceptación al cliente.
// Requiere ser asignado, PM o administrador. Al reenviar, exige evidencia de corrección en lo devuelto.
const schema = z.object({ deliverables: z.array(fileRefSchema.extend({ id: z.string().optional() })).min(1).max(20) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withBody(
    request,
    schema,
    (actor, data) =>
      submitAcceptanceRound(
        id,
        data.deliverables.map((d) => ({
          id: d.id,
          name: d.name,
          url: d.url,
          mimeType: d.mimeType ?? (/^https?:\/\//i.test(d.url) ? LINK_MIME_TYPE : mimeFromFileName(d.name || d.url)),
        })),
        actor
      ),
    201
  );
}
