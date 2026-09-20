import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser, safeJson } from "@/lib/apiAuth";
import { respond, withAuth } from "@/lib/apiResult";
import { prisma } from "@/lib/prisma";
import { addAdjustmentItems, adjustmentItemSchema, checkSchema, designReviewTask, fileRefSchema, getTaskDesign } from "@/lib/taskDesign";

// GET: estructura completa de una tarea de tipo Ajuste, Prueba o Aceptación (cambios o rondas con sus pruebas/características,
// adjuntos, resultados y la calificación del cliente). Cualquier usuario con sesión.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(request, (actor) => getTaskDesign(id, actor));
}

const adjustmentBody = z.object({ items: z.array(adjustmentItemSchema).min(1).max(100) });
const reviewBody = z.object({
  deliverables: z.array(fileRefSchema).max(20).optional(),
  templateId: z.string().optional(),
  checks: z.array(checkSchema).max(200).optional(),
});

// POST: sube el diseño completo en un solo llamado, según el tipo de la tarea.
//  - Ajuste:            { items: [{ description, note?, before?: [archivo], after?: [archivo] }] }
//  - Prueba/Aceptación: { deliverables?: [archivo], templateId?, checks: [{ title, criteria?, category?, evidence?: [archivo] }] }
//    (crea la primera ronda si no existe —y entonces exige al menos un entregable— y le carga los checks).
// archivo = { url, name, mimeType? } con la url que devolvió POST /api/upload, o un link https://.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const parsedBody = await safeJson(request);
  if ("error" in parsedBody) return parsedBody.error;

  const task = await prisma.task.findUnique({ where: { id }, select: { type: true } });
  if (!task) return NextResponse.json({ error: "La tarea no existe." }, { status: 404 });

  const schema = task.type === "ADJUSTMENT" ? adjustmentBody : reviewBody;
  if (task.type !== "ADJUSTMENT" && task.type !== "QA" && task.type !== "ACCEPTANCE") {
    return NextResponse.json({ error: "Esta tarea no es de tipo Ajuste, Prueba ni Aceptación." }, { status: 409 });
  }
  const parsed = schema.safeParse(parsedBody.data);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "cuerpo"}: ${i.message}`);
    return NextResponse.json({ error: issues[0], details: issues }, { status: 400 });
  }
  const result =
    task.type === "ADJUSTMENT"
      ? await addAdjustmentItems(id, auth.actor, (parsed.data as z.infer<typeof adjustmentBody>).items)
      : await designReviewTask(id, auth.actor, parsed.data as z.infer<typeof reviewBody>);
  return respond(result, 201);
}
