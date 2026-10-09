"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TAG_CATEGORY_COLORS } from "@/lib/tagColors";
import { ColorSwatchPicker } from "./TagCategoriesPanel";
import { createTagCategory } from "./tagActions";

export type TagCategoryOption = { id: string; name: string; colorHex: string; emoji: string | null };

const NEW_CATEGORY = "__new__";

/**
 * Selector de categoría de «+ Etiqueta», compartido por TaskTagsEditor (tarea
 * existente) y NewTaskTagsPicker (formulario de nueva tarea). Con `canCreate`
 * (PM o administrador, mismo permiso que en Configuración) ofrece
 * «+ Nueva categoría…»: nombre, emoji opcional y color de la paleta, igual
 * que en Configuración. La categoría creada se elige al instante.
 */
export function TagCategorySelect({
  categories,
  value,
  onChange,
  canCreate,
  onCreated,
}: {
  categories: TagCategoryOption[];
  value: string;
  onChange: (categoryId: string) => void;
  canCreate: boolean;
  onCreated: (category: TagCategoryOption) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [colorHex, setColorHex] = useState(TAG_CATEGORY_COLORS[0]);
  const [error, setError] = useState<string | null>(null);

  function handleCreate() {
    if (!name.trim()) return;
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("name", name);
      formData.set("colorHex", colorHex);
      formData.set("emoji", emoji);
      const result = await createTagCategory(formData);
      if (result.ok) {
        onCreated(result.category);
        onChange(result.category.id);
        setCreating(false);
        setName("");
        setEmoji("");
        router.refresh();
      } else {
        setError(result.error ?? "No se pudo crear la categoría.");
      }
    });
  }

  return (
    <>
      <select
        value={creating ? NEW_CATEGORY : value}
        onChange={(e) => {
          if (e.target.value === NEW_CATEGORY) {
            setCreating(true);
            onChange("");
          } else {
            setCreating(false);
            onChange(e.target.value);
          }
        }}
        className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
      >
        <option value="">Categoría…</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.emoji ? `${c.emoji} ` : ""}
            {c.name}
          </option>
        ))}
        {canCreate && <option value={NEW_CATEGORY}>+ Nueva categoría…</option>}
      </select>

      {creating && (
        <div className="basis-full space-y-2 rounded-lg border border-slate-200 bg-white p-2.5">
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              // Enter crea la categoría; sin preventDefault enviaría el
              // formulario de la tarea que contiene a este selector.
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleCreate();
                }
              }}
              placeholder="Nombre de la categoría"
              autoFocus
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1 text-xs"
            />
            <input
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              placeholder="Emoji (opcional)"
              className="w-28 flex-shrink-0 rounded-lg border border-slate-300 px-2 py-1 text-xs"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ColorSwatchPicker value={colorHex} onChange={setColorHex} />
            <div className="flex gap-1.5">
              <button
                type="button"
                disabled={isPending || !name.trim()}
                onClick={handleCreate}
                className="rounded-lg bg-slate-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
              >
                Crear categoría
              </button>
              <button type="button" onClick={() => setCreating(false)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-500">
                Cancelar
              </button>
            </div>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      )}
    </>
  );
}
