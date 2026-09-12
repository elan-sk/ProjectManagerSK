"use client";

import { useState } from "react";
import { TagChip } from "@/components/TagChip";

type Category = { id: string; name: string; colorHex: string; emoji: string | null };
type Row = { categoryId: string; name: string };

// Mismo criterio que TaskTagsEditor (una etiqueta por categoría) pero para
// el formulario de creación — todavía no hay taskId, así que cada fila viaja
// como un par de inputs ocultos paralelos (tagCategoryId[] / tagName[]) que
// addTask zipea de vuelta al crear la tarea.
export function NewTaskTagsPicker({
  categories,
  projectTagNamesByCategory,
}: {
  categories: Category[];
  projectTagNamesByCategory: Record<string, string[]>;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [adding, setAdding] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [name, setName] = useState("");

  const usedCategoryIds = new Set(rows.map((r) => r.categoryId));
  const availableCategories = categories.filter((c) => !usedCategoryIds.has(c.id));
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  function addRow() {
    if (!categoryId || !name.trim()) return;
    setRows([...rows, { categoryId, name: name.trim() }]);
    setAdding(false);
    setCategoryId("");
    setName("");
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
              <TagChip colorHex={c.colorHex} emoji={c.emoji} name={r.name} onRemove={() => removeRow(i)} />
            </span>
          );
        })}

        {!adding && availableCategories.length > 0 && (
          <button type="button" onClick={() => setAdding(true)} className="text-xs text-slate-400 hover:text-slate-600 hover:underline">
            + Etiqueta
          </button>
        )}

        {adding && (
          <div className="flex items-center gap-1.5">
            <select
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                setName("");
              }}
              className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
            >
              <option value="">Categoría…</option>
              {availableCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.emoji ? `${c.emoji} ` : ""}
                  {c.name}
                </option>
              ))}
            </select>
            {categoryId && (
              <>
                <input
                  list={`new-tag-names-${categoryId}`}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addRow())}
                  placeholder="Nombre (ej. hero-banner)"
                  autoFocus
                  className="w-40 rounded-lg border border-slate-300 px-2 py-1 text-xs"
                />
                <datalist id={`new-tag-names-${categoryId}`}>
                  {(projectTagNamesByCategory[categoryId] ?? []).map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </>
            )}
            <button type="button" disabled={!categoryId || !name.trim()} onClick={addRow} className="rounded-lg bg-slate-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-50">
              OK
            </button>
            <button type="button" onClick={() => setAdding(false)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-500">
              ✕
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
