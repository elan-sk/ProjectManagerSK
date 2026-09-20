import { z } from "zod";
import { withBody } from "@/lib/apiResult";
import { addAdjustmentAttachments, fileRefSchema } from "@/lib/taskDesign";

// Agrega archivos o links al «antes» o al «después» de un cambio: { kind: "BEFORE" | "AFTER", files: [{ url, name, mimeType? }] }.
const schema = z.object({ kind: z.enum(["BEFORE", "AFTER"]), files: z.array(fileRefSchema).min(1).max(20) });

export async function POST(request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  return withBody(request, schema, (actor, data) => addAdjustmentAttachments(itemId, actor, data.kind, data.files), 201);
}
