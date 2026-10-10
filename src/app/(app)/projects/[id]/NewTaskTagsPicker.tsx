"use client";

import { useState } from "react";
import { TagChip } from "@/components/TagChip";
import { AddTagModal, type TagCategoryOption } from "../../settings/tags/TagCategorySelect";

type Category = { id: string; name: string; colorHex: string; emoji: string | null };
type Row = { categoryId: string; name: string };

// Mismo criterio que TaskTagsEditor (una etiqueta por categoría) pero para
// el formulario de creación — todavía no hay taskId, así que cada fila viaja
// como un par de inputs ocultos paralelos (tagCategoryId[] / tagName[]) que
// addTask zipea de vuelta al crear la tarea.
export function NewTaskTagsPicker({
  categories,
  projectTagNamesByCategory,
  canCreateCategory,
}: {
  categories: Category[];
  projectTagNamesByCategory: Record<string, string[]>;
  canCreateCategory: boolean;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [adding, setAdding] = useState(false);
  // Categorías creadas desde acá: se usan ya, antes de que llegue el refresh.
  const [createdCategories, setCreatedCategories] = useState<TagCategoryOption[]>([]);

  const usedCategoryIds = new Set(rows.map((r) => r.categoryId));
  const allCategories = [...categories, ...createdCategories.filter((c) => !categories.some((k) => k.id === c.id))];
  const availableCategories = allCategories.filter((c) => !usedCategoryIds.has(c.id));
  const categoryById = new Map(allCategories.map((c) => [c.id, c]));

  function addRow(categoryId: string, name: string) {
    setRows([...rows, { categoryId, name }]);
    setAdding(false);
  }

  function removeRow(index: number) {
    setRows(rows.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-1.5">
      <label className="text-sm text-slate-600">Etiquetas (opcional)</label>
      <div className="flex flex-wrap items-center gap-1.5">
        {rows.map((r, i) => {
          const c = categoryById.get(r.categoryId)!;
          return (
            <span key={i}>
              <input type="hidden" name="tagCategoryId" value={r.categoryId} />
              <input type="hidden" name="tagName" value={r.name} />
              <TagChip colorHex={c.colorHex} emoji={c.emoji} categoryName={c.name} name={r.name} size="md" onRemove={() => removeRow(i)} />
            </span>
          );
        })}

        {(availableCategories.length > 0 || canCreateCategory) && (
          <button type="button" onClick={() => setAdding(true)} className="cursor-pointer text-sm text-slate-400 hover:text-slate-600 hover:underline">
            + Etiqueta
          </button>
        )}

        {/* En modal: en línea, el formulario (y más aún el de nueva categoría) descuadraba la fila. */}
        {adding && (
          <AddTagModal
            onClose={() => setAdding(false)}
            categories={availableCategories}
            canCreateCategory={canCreateCategory}
            onCategoryCreated={(c) => setCreatedCategories((prev) => [...prev, c])}
            tagNamesByCategory={projectTagNamesByCategory}
            onAdd={addRow}
          />
        )}
      </div>
    </div>
  );
}
