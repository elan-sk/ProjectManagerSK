"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/Confirm";
import { DEFAULT_COLORS } from "@/components/ProjectIcon";
import { createTagCategory, updateTagCategory, deleteTagCategory } from "./tagActions";

type Category = { id: string; name: string; colorHex: string; emoji: string | null };

function ColorSwatchPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <input type="hidden" name="colorHex" value={value} />
      {DEFAULT_COLORS.map((hex) => (
        <button
          key={hex}
          type="button"
          onClick={() => onChange(hex)}
          title={hex}
          style={{ backgroundColor: hex }}
          className={`h-6 w-6 rounded-full ring-2 ring-offset-2 ${value === hex ? "ring-slate-900" : "ring-transparent"}`}
        />
      ))}
    </div>
  );
}

export function TagCategoriesPanel({ categories, isAdmin, canCreate }: { categories: Category[]; isAdmin: boolean; canCreate: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [colorHex, setColorHex] = useState(DEFAULT_COLORS[0]);
  const [emoji, setEmoji] = useState("");
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
        setName("");
        setEmoji("");
        router.refresh();
      } else {
        setError(result.error ?? "No se pudo crear la categoría.");
      }
    });
  }

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="font-medium text-slate-900">Categorías de etiqueta</h2>
      <div className="space-y-2">
        {categories.map((c) => (
          <CategoryRow key={c.id} category={c} isAdmin={isAdmin} />
        ))}
        {categories.length === 0 && <p className="text-sm text-slate-400">Sin categorías todavía.</p>}
      </div>
      {canCreate && (
        <div className="space-y-2 border-t border-slate-100 pt-3">
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre de la categoría (ej. Componentes)…"
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              placeholder="Emoji (opcional)"
              className="w-32 flex-shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex items-center gap-3">
            <ColorSwatchPicker value={colorHex} onChange={setColorHex} />
            <button
              type="button"
              disabled={isPending || !name.trim()}
              onClick={handleCreate}
              className="flex-shrink-0 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              Crear
            </button>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      )}
    </section>
  );
}

function CategoryRow({ category, isAdmin }: { category: Category; isAdmin: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [colorHex, setColorHex] = useState(category.colorHex);
  const [emoji, setEmoji] = useState(category.emoji ?? "");
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    if (!name.trim()) return;
    startTransition(async () => {
      const formData = new FormData();
      formData.set("name", name);
      formData.set("colorHex", colorHex);
      formData.set("emoji", emoji);
      const result = await updateTagCategory(category.id, formData);
      if (result.ok) {
        setEditing(false);
        router.refresh();
      }
    });
  }

  async function handleDelete() {
    const ok = await confirm(
      `¿Seguro que querés eliminar la categoría "${category.name}"? Las etiquetas ya puestas en tareas con esta categoría también se van a borrar. No vas a poder deshacer esto.`,
      { confirmLabel: "Eliminar", danger: true }
    );
    if (!ok) return;
    await deleteTagCategory(category.id);
    router.refresh();
  }

  if (editing) {
    return (
      <div className="space-y-2 rounded-lg border border-slate-300 p-3">
        <div className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
          <input value={emoji} onChange={(e) => setEmoji(e.target.value)} placeholder="Emoji" className="w-24 flex-shrink-0 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
        </div>
        <div className="flex items-center justify-between gap-3">
          <ColorSwatchPicker value={colorHex} onChange={setColorHex} />
          <div className="flex gap-2">
            <button type="button" disabled={isPending} onClick={handleSave} className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800">
              Guardar
            </button>
            <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-500">
              Cancelar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 p-2.5">
      <button type="button" onClick={() => setEditing(true)} className="flex min-w-0 items-center gap-2 text-left hover:underline">
        <span className="h-4 w-4 flex-shrink-0 rounded-full" style={{ backgroundColor: category.colorHex }} />
        {category.emoji && <span>{category.emoji}</span>}
        <span className="truncate text-sm font-medium text-slate-800">{category.name}</span>
      </button>
      {isAdmin && (
        <button type="button" onClick={handleDelete} className="flex-shrink-0 text-xs text-slate-400 hover:text-red-600">
          Eliminar
        </button>
      )}
    </div>
  );
}
