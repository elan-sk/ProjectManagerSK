import { runAction, withBody } from "@/lib/apiResult";
import { createTagCategory } from "@/app/(app)/settings/tags/tagActions";
import { categoryForm, categorySchema } from "@/lib/tagCategoryInput";

// Crea una categoría de etiqueta global: { name, colorHex (uno de la paleta), emoji? }. PM de algún proyecto o administrador.
// La lista (con ids) está en GET /api/v1/tags.
export async function POST(request: Request) {
  return withBody(request, categorySchema, (actor, data) => runAction(() => createTagCategory(categoryForm(data), actor)), 201);
}
