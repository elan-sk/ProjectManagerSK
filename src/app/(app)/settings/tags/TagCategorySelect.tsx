"use client";

import { useId, useRef, useState, useTransition } from "react";
import { TAG_CATEGORY_COLORS } from "@/lib/tagColors";
import { EmojiButton } from "@/components/EmojiButton";
import { ModalShell } from "@/components/Modal";
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
  selectClassName = "rounded-lg border border-slate-300 px-2 py-1 text-xs",
}: {
  categories: TagCategoryOption[];
  value: string;
  onChange: (categoryId: string) => void;
  canCreate: boolean;
  onCreated: (category: TagCategoryOption) => void;
  selectClassName?: string;
}) {
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
        // Sin router.refresh(): la categoría ya queda disponible por onCreated, y refrescar
        // renderizaba toda la página de la tarea solo para volver a traer la lista.
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
        aria-label="Categoría"
        className={selectClassName}
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
            <EmojiButton onPick={setEmoji} title="Elegir emoji" className="flex-shrink-0 cursor-pointer rounded-lg border border-slate-300 px-2 text-slate-500 hover:bg-slate-50 hover:text-slate-800" />
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

const FIELD = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";

/**
 * Modal «Agregar etiqueta», compartido por TaskTagsEditor y NewTaskTagsPicker. Muestra de entrada
 * todo lo que se va a usar: la categoría y el nombre de la etiqueta, este último deshabilitado
 * hasta elegir categoría. Se monta solo mientras está abierto, así arranca siempre en blanco.
 */
export function AddTagModal({
  onClose,
  categories,
  canCreateCategory,
  onCategoryCreated,
  tagNamesByCategory,
  onAdd,
}: {
  onClose: () => void;
  categories: TagCategoryOption[];
  canCreateCategory: boolean;
  onCategoryCreated: (category: TagCategoryOption) => void;
  /** Nombres ya usados en el proyecto por categoría: se sugieren, pero se puede escribir uno nuevo. */
  tagNamesByCategory: Record<string, string[]>;
  onAdd: (categoryId: string, name: string) => void;
}) {
  const [categoryId, setCategoryId] = useState("");
  const [name, setName] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const submit = () => {
    if (categoryId) onAdd(categoryId, name.trim());
  };

  return (
    <ModalShell open onClose={onClose} title="Agregar etiqueta">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-slate-700">Categoría</p>
          <div className="flex flex-wrap gap-2">
            <TagCategorySelect
              categories={categories}
              value={categoryId}
              onChange={(next) => {
                setCategoryId(next);
                setName("");
                if (next) requestAnimationFrame(() => nameRef.current?.focus());
              }}
              canCreate={canCreateCategory}
              onCreated={onCategoryCreated}
              selectClassName={FIELD}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${id}-name`} className="block text-sm font-medium text-slate-700">
            Etiqueta <span className="font-normal text-slate-400">(opcional)</span>
          </label>
          <input
            ref={nameRef}
            id={`${id}-name`}
            list={`${id}-names`}
            value={name}
            disabled={!categoryId}
            onChange={(e) => setName(e.target.value)}
            // Sin preventDefault, Enter enviaría el formulario de la tarea que contiene a este modal.
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              submit();
            }}
            placeholder={categoryId ? "Nombre de la etiqueta" : "Primero se elige la categoría"}
            className={`${FIELD} disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400`}
          />
          <datalist id={`${id}-names`}>
            {(tagNamesByCategory[categoryId] ?? []).map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="cursor-pointer rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-600 hover:bg-slate-50">
            Cancelar
          </button>
          <button type="button" disabled={!categoryId} onClick={submit} className="cursor-pointer rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">
            Agregar etiqueta
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
