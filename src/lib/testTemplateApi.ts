import { z } from "zod";
import { isReviewerAnywhere, type Actor } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { ApiResult } from "@/lib/apiResult";

// Plantillas de pruebas por API (/api/v1/test-templates): todo exige ser
// revisor, PM o administrador, igual que la web; borrar sigue siendo solo de administrador.

export const templateItemSchema = z.object({
  title: z.string().trim().min(1),
  criteria: z.string().optional(),
  category: z.string().optional(),
});

export const DENIED: ApiResult = { ok: false, status: 403, error: "Solo un revisor, un PM o un administrador pueden gestionar plantillas de pruebas." };
export const TEMPLATE_NOT_FOUND: ApiResult = { ok: false, status: 404, error: "La plantilla no existe." };
export const ITEM_NOT_FOUND: ApiResult = { ok: false, status: 404, error: "La prueba de la plantilla no existe." };

export const canManageTemplates = (actor: Actor) => isReviewerAnywhere(actor);
export const templateExists = async (id: string) => Boolean(await prisma.testTemplate.findUnique({ where: { id }, select: { id: true } }));
export const templateItemExists = async (id: string) => Boolean(await prisma.testTemplateItem.findUnique({ where: { id }, select: { id: true } }));

/** Las acciones de la web reciben FormData: mismo formato que su formulario. */
export function itemFormData(item: z.infer<typeof templateItemSchema>) {
  const formData = new FormData();
  formData.set("title", item.title);
  if (item.criteria) formData.set("criteria", item.criteria);
  if (item.category) formData.set("category", item.category);
  return formData;
}
