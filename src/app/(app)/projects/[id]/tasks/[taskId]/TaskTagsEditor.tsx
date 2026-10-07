"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TagChip } from "@/components/TagChip";
import { setTaskTag, removeTaskTag } from "../../../../settings/tags/tagActions";
import { TagCategorySelect, type TagCategoryOption } from "../../../../settings/tags/TagCategorySelect";

type CurrentTag = { taskTagId: string; categoryId: string; categoryName: string; colorHex: string; emoji: string | null; name: string };
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
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Categorías creadas desde acá: se usan ya, antes de que llegue el refresh.
  const [createdCategories, setCreatedCategories] = useState<TagCategoryOption[]>([]);

  const usedCategoryIds = new Set(currentTags.map((t) => t.categoryId));
  const allCategories = [...categories, ...createdCategories.filter((c) => !categories.some((k) => k.id === c.id))];
  const availableCategories = allCategories.filter((c) => !usedCategoryIds.has(c.id));

  function handleAdd() {
    if (!categoryId) return;
    setError(null);
    startTransition(async () => {
      const result = await setTaskTag(taskId, categoryId, name.trim());
      if (result.ok) {
        setAdding(false);
        setCategoryId("");
        setName("");
        router.refresh();
      } else {
        setError(result.error ?? "No se pudo agregar la etiqueta.");
      }
    });
  }

  function handleRemove(taskTagId: string) {
    startTransition(async () => {
      await removeTaskTag(taskTagId);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {currentTags.map((t) => (
        <TagChip key={t.taskTagId} colorHex={t.colorHex} emoji={t.emoji} categoryName={t.categoryName} name={t.name} onRemove={canEdit ? () => handleRemove(t.taskTagId) : undefined} />
      ))}

      {canEdit && !adding && (availableCategories.length > 0 || canCreateCategory) && (
        <button type="button" onClick={() => setAdding(true)} className="text-xs text-slate-400 hover:text-slate-600 hover:underline">
          + Etiqueta
        </button>
      )}

      {canEdit && adding && (
        <div className="flex flex-wrap items-center gap-1.5">
          <TagCategorySelect
            categories={availableCategories}
            value={categoryId}
            onChange={(id) => {
              setCategoryId(id);
              setName("");
            }}
            canCreate={canCreateCategory}
            onCreated={(c) => setCreatedCategories((prev) => [...prev, c])}
          />
          {categoryId && (
            <>
              <input
                list={`tag-names-${categoryId}`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                placeholder="Etiqueta (opcional)"
                autoFocus
                className="w-40 rounded-lg border border-slate-300 px-2 py-1 text-xs"
              />
              <datalist id={`tag-names-${categoryId}`}>
                {(projectTagNamesByCategory[categoryId] ?? []).map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </>
          )}
          <button type="button" disabled={isPending || !categoryId} onClick={handleAdd} className="rounded-lg bg-slate-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-50">
            OK
          </button>
          <button type="button" onClick={() => setAdding(false)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-500">
            ✕
          </button>
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
