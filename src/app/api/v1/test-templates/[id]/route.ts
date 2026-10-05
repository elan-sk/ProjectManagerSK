import { z } from "zod";
import { runAction, withAuth, withBody } from "@/lib/apiResult";
import { deleteTestTemplate, updateTestTemplate } from "@/app/(app)/settings/tests/testActions";
import { DENIED, TEMPLATE_NOT_FOUND, canManageTemplates, templateExists } from "@/lib/testTemplateApi";

const schema = z.object({ name: z.string().trim().min(1) });

// Renombra la plantilla.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withBody(request, schema, async (actor, data) => {
    if (!(await canManageTemplates(actor))) return DENIED;
    if (!(await templateExists(id))) return TEMPLATE_NOT_FOUND;
    return runAction(() => updateTestTemplate(id, data.name, actor));
  });
}

// Borra la plantilla con todos sus ítems (solo administrador). Las tareas que la tenían por defecto quedan sin plantilla.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(request, async (actor) => {
    if (!(await canManageTemplates(actor))) return DENIED;
    if (!(await templateExists(id))) return TEMPLATE_NOT_FOUND;
    return runAction(() => deleteTestTemplate(id, actor));
  });
}
