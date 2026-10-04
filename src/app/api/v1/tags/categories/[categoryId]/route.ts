import { runAction, withAuth, withBody } from "@/lib/apiResult";
import { deleteTagCategory, updateTagCategory } from "@/app/(app)/settings/tags/tagActions";
import { categoryForm, categorySchema } from "@/lib/tagCategoryInput";

// PATCH { name, colorHex, emoji? }: edita la categoría (PM de algún proyecto o administrador).
// DELETE: la borra definitivamente con sus etiquetas (solo administrador).
type Params = { params: Promise<{ categoryId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { categoryId } = await params;
  return withBody(request, categorySchema, (actor, data) => runAction(() => updateTagCategory(categoryId, categoryForm(data), actor)));
}

export async function DELETE(request: Request, { params }: Params) {
  const { categoryId } = await params;
  return withAuth(request, (actor) => runAction(() => deleteTagCategory(categoryId, actor)));
}
