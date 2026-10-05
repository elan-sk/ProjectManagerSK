import { runAction, withAuth, withBody } from "@/lib/apiResult";
import { deleteTestTemplateItem, updateTestTemplateItem } from "@/app/(app)/settings/tests/testActions";
import { DENIED, ITEM_NOT_FOUND, canManageTemplates, itemFormData, templateItemExists, templateItemSchema } from "@/lib/testTemplateApi";

// Reescribe una prueba de la plantilla (título, criterios y categoría completos: lo que no se mande queda vacío).
export async function PATCH(request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  return withBody(request, templateItemSchema, async (actor, data) => {
    if (!(await canManageTemplates(actor))) return DENIED;
    if (!(await templateItemExists(itemId))) return ITEM_NOT_FOUND;
    return runAction(() => updateTestTemplateItem(itemId, itemFormData(data), actor));
  });
}

// Borra la prueba de la plantilla (solo administrador). No toca las rondas donde ya se aplicó.
export async function DELETE(request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  return withAuth(request, async (actor) => {
    if (!(await canManageTemplates(actor))) return DENIED;
    if (!(await templateItemExists(itemId))) return ITEM_NOT_FOUND;
    return runAction(() => deleteTestTemplateItem(itemId, actor));
  });
}
