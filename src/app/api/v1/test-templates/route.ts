import { z } from "zod";
import { runAction, withAuth, withBody } from "@/lib/apiResult";
import { prisma } from "@/lib/prisma";
import { addTestTemplateItem, createTestTemplate } from "@/app/(app)/settings/tests/testActions";
import { DENIED, canManageTemplates, itemFormData, templateItemSchema } from "@/lib/testTemplateApi";

// Lista las plantillas de pruebas con sus ítems (en orden).
export async function GET(request: Request) {
  return withAuth(request, async (actor) => {
    if (!(await canManageTemplates(actor))) return DENIED;
    const templates = await prisma.testTemplate.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, items: { orderBy: { order: "asc" }, select: { id: true, title: true, criteria: true, category: true } } },
    });
    return { ok: true, templates };
  });
}

// Crea una plantilla y, opcionalmente, sus ítems en el mismo llamado.
const schema = z.object({ name: z.string().trim().min(1), items: z.array(templateItemSchema).default([]) });

export async function POST(request: Request) {
  return withBody(
    request,
    schema,
    async (actor, data) => {
      if (!(await canManageTemplates(actor))) return DENIED;
      const formData = new FormData();
      formData.set("name", data.name);
      const created = await createTestTemplate(formData, actor);
      if (!created.ok) return created;
      const itemIds: string[] = [];
      for (const item of data.items) {
        const r = await runAction(() => addTestTemplateItem(created.id, itemFormData(item), actor));
        if (!r.ok) return r;
        itemIds.push(r.id as string);
      }
      return { ok: true, id: created.id, itemIds };
    },
    201
  );
}
