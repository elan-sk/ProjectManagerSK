"use client";

import { useOptimistic, useState, useTransition } from "react";
import { TagChip } from "@/components/TagChip";
import { setTaskTag, removeTaskTag } from "../../../../settings/tags/tagActions";
import { AddTagModal, type TagCategoryOption } from "../../../../settings/tags/TagCategorySelect";

type CurrentTag = { taskTagId: string; categoryId: string; categoryName: string; colorHex: string; emoji: string | null; name: string };
const PENDING_ID = "pending";

type Category = { id: string; name: string; colorHex: string; emoji: string | null };

// Punto 17 confirmado con el usuario: una sola etiqueta por categoría por
// tarea — por eso el selector de "+ Etiqueta" solo ofrece categorías que
// esta tarea todavía no tiene. El nombre se escribe en un input con
// <datalist> (sugiere los ya usados en este proyecto bajo esa categoría,
// pero deja escribir uno nuevo — se guarda solo, confirmado con el usuario).
export function TaskTagsEditor({
  taskId,
  currentTags,
  categories,
  projectTagNamesByCategory,
  canEdit,
  canCreateCategory,
}: {
  taskId: string;
  currentTags: CurrentTag[];
  categories: Category[];
  projectTagNamesByCategory: Record<string, string[]>;
  canEdit: boolean;
  canCreateCategory: boolean;
}) {
  const [, startTransition] = useTransition();
  // La etiqueta aparece o desaparece al instante y el servidor confirma después: su respuesta ya
  // trae la página actualizada (revalidatePath), así que no hace falta un router.refresh() aparte
  // (eso la renderizaba dos veces). Si el servidor falla, la fila vuelve sola a como estaba.
  const [tags, applyOptimistic] = useOptimistic(currentTags, (state, change: { set: CurrentTag } | { remove: string }) =>
    "set" in change
      ? [...state.filter((t) => t.categoryId !== change.set.categoryId), change.set]
      : state.filter((t) => t.taskTagId !== change.remove)
  );
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Categorías creadas desde acá: se usan ya, antes de que llegue el refresh.
  const [createdCategories, setCreatedCategories] = useState<TagCategoryOption[]>([]);

  const usedCategoryIds = new Set(tags.map((t) => t.categoryId));
  const allCategories = [...categories, ...createdCategories.filter((c) => !categories.some((k) => k.id === c.id))];
  const availableCategories = allCategories.filter((c) => !usedCategoryIds.has(c.id));

  function handleAdd(categoryId: string, name: string) {
    const category = allCategories.find((c) => c.id === categoryId);
    if (!category) return;
    setError(null);
    setAdding(false);
    startTransition(async () => {
      applyOptimistic({ set: { taskTagId: PENDING_ID, categoryId, categoryName: category.name, colorHex: category.colorHex, emoji: category.emoji, name } });
      const result = await setTaskTag(taskId, categoryId, name).catch(() => null);
      if (!result?.ok) setError(result?.error ?? "No se pudo agregar la etiqueta. Conviene intentarlo de nuevo.");
    });
  }

  function handleRemove(taskTagId: string) {
    setError(null);
    startTransition(async () => {
      applyOptimistic({ remove: taskTagId });
      const result = await removeTaskTag(taskTagId).catch(() => null);
      if (!result?.ok) setError(result?.error ?? "No se pudo quitar la etiqueta. Conviene intentarlo de nuevo.");
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {tags.map((t) => (
        // La recién agregada aún no tiene id real: no se puede quitar hasta que el servidor confirme.
        <TagChip key={t.categoryId} colorHex={t.colorHex} emoji={t.emoji} categoryName={t.categoryName} name={t.name} size="md" onRemove={canEdit && t.taskTagId !== PENDING_ID ? () => handleRemove(t.taskTagId) : undefined} />
      ))}

      {canEdit && (availableCategories.length > 0 || canCreateCategory) && (
        <button type="button" onClick={() => { setError(null); setAdding(true); }} className="cursor-pointer text-sm text-slate-400 hover:text-slate-600 hover:underline">
          + Etiqueta
        </button>
      )}

      {/* En modal: en línea, el formulario (y más aún el de nueva categoría) descuadraba la fila. */}
      {canEdit && adding && (
        <AddTagModal
          onClose={() => setAdding(false)}
          categories={availableCategories}
          canCreateCategory={canCreateCategory}
          onCategoryCreated={(c) => setCreatedCategories((prev) => [...prev, c])}
          tagNamesByCategory={projectTagNamesByCategory}
          onAdd={handleAdd}
        />
      )}
      {error && <p className="basis-full text-sm text-red-600">{error}</p>}
    </div>
  );
}
