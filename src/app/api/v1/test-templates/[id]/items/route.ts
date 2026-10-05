import { runAction, withBody } from "@/lib/apiResult";
import { addTestTemplateItem } from "@/app/(app)/settings/tests/testActions";
import { DENIED, TEMPLATE_NOT_FOUND, canManageTemplates, itemFormData, templateExists, templateItemSchema } from "@/lib/testTemplateApi";

// Agrega una prueba al final de la plantilla.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withBody(
    request,
    templateItemSchema,
    async (actor, data) => {
      if (!(await canManageTemplates(actor))) return DENIED;
      if (!(await templateExists(id))) return TEMPLATE_NOT_FOUND;
      return runAction(() => addTestTemplateItem(id, itemFormData(data), actor));
    },
    201
  );
}
