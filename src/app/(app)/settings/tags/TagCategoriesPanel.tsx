"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/lib/useAppRouter";
import { useConfirm } from "@/components/Confirm";
import { ToolbarButton } from "@/components/ToolbarButton";
import { TrashIcon } from "@/components/icons";
import { EmojiButton } from "@/components/EmojiButton";
import { TAG_CATEGORY_COLORS } from "@/lib/tagColors";
import { createTagCategory, updateTagCategory, deleteTagCategory, deleteTag, updateTag } from "./tagActions";

import type { TagCategorySummary as Category } from "@/lib/tagSummary";

export function ColorSwatchPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <input type="hidden" name="colorHex" value={value} />
      {/* Una categoría vieja con un color de la paleta anterior lo sigue mostrando, primero. */}
      {[...(TAG_CATEGORY_COLORS.includes(value) ? [] : [value]), ...TAG_CATEGORY_COLORS].map((hex) => (
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
  const [colorHex, setColorHex] = useState(TAG_CATEGORY_COLORS[0]);
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
          <div key={c.id} className="overflow-hidden rounded-lg border border-slate-200">
            <CategoryRow category={c} isAdmin={isAdmin} canEdit={canCreate} />
            <div className="space-y-2 border-t border-slate-100 px-3 py-2">
              {c.tags.map((tag) => <TagRow key={tag.id} tag={tag} isAdmin={isAdmin} />)}
              {c.tags.length === 0 && <p className="text-xs text-slate-500">Sin etiquetas en los proyectos visibles.</p>}
            </div>
          </div>
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
            <EmojiButton onPick={setEmoji} title="Elegir emoji" className="flex-shrink-0 cursor-pointer rounded-lg border border-slate-300 px-2.5 text-slate-500 hover:bg-slate-50 hover:text-slate-800" />
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

function CategoryRow({ category, isAdmin, canEdit }: { category: Category; isAdmin: boolean; canEdit: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [error, setError] = useState<string | null>(null);
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
      `¿Eliminar la categoría «${category.name}» y todas sus etiquetas de todos los proyectos? Se quitarán de las tareas, pero las tareas se conservarán. Esta acción no se puede deshacer.`,
      { confirmLabel: "Eliminar", danger: true }
    );
    if (!ok) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await deleteTagCategory(category.id);
        if (result.ok) router.refresh();
        else setError(result.error);
      } catch {
        setError("No se pudo eliminar la categoría. Se puede intentar nuevamente.");
      }
    });
  }

  if (editing) {
    return (
      <div className="space-y-2 rounded-lg border border-slate-300 p-3">
        <div className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
          <input value={emoji} onChange={(e) => setEmoji(e.target.value)} placeholder="Emoji" className="w-24 flex-shrink-0 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
          <EmojiButton onPick={setEmoji} title="Elegir emoji" className="flex-shrink-0 cursor-pointer rounded-lg border border-slate-300 px-2 text-slate-500 hover:bg-slate-50 hover:text-slate-800" />
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
    <div className="flex flex-wrap items-center gap-2 bg-slate-50 p-2.5">
      <button type="button" disabled={!canEdit || isPending} onClick={() => setEditing(true)} className="flex min-w-0 items-center gap-2 text-left hover:underline">
        <span className="h-4 w-4 flex-shrink-0 rounded-full" style={{ backgroundColor: category.colorHex }} />
        {category.emoji && <span>{category.emoji}</span>}
        <span className="truncate text-sm font-medium text-slate-800">{category.name}</span>
      </button>
      <TaskCount count={category.taskCount} />
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      {isAdmin && (
        <ToolbarButton icon={<TrashIcon className="h-4 w-4" />} label={`Eliminar categoría ${category.name}`} onClick={handleDelete} disabled={isPending} danger />
      )}
    </div>
  );
}

function TaskCount({ count }: { count: number }) {
  return <span className="ml-auto shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium tabular-nums text-slate-600">{count} {count === 1 ? "tarea" : "tareas"}</span>;
}

function TagRow({ tag, isAdmin }: { tag: Category["tags"][number]; isAdmin: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(tag.name);
  const label = tag.name || "Solo categoría";

  function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const result = await updateTag(tag.id, name);
        if (result.ok) {
          setEditing(false);
          router.refresh();
        } else setError(result.error);
      } catch {
        setError("No se pudo guardar la etiqueta. Se puede intentar nuevamente.");
      }
    });
  }

  async function handleDelete() {
    const ok = await confirm(
      `¿Eliminar la etiqueta «${label}» del proyecto «${tag.projectName}»? Se quitará de ${tag.taskCount} ${tag.taskCount === 1 ? "tarea" : "tareas"}. Las tareas se conservarán. Esta acción no se puede deshacer.`,
      { confirmLabel: "Eliminar etiqueta", danger: true }
    );
    if (!ok) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await deleteTag(tag.id);
        if (result.ok) router.refresh();
        else setError(result.error);
      } catch {
        setError("No se pudo eliminar la etiqueta. Se puede intentar nuevamente.");
      }
    });
  }

  if (editing) {
    return (
      <form onSubmit={handleSave} className="space-y-2 rounded-lg border border-slate-200 p-3">
        <label className="block text-xs text-slate-600">
          Nombre de la etiqueta
          <input autoFocus required maxLength={80} value={name} disabled={isPending} onChange={event => setName(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <p className="text-xs text-slate-500">{tag.projectName} · El cambio se aplicará a todas las tareas que usan esta etiqueta.</p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={isPending || !name.trim()} className="rounded-lg bg-slate-900 px-3 py-2 text-xs text-white disabled:opacity-50">{isPending ? "Guardando…" : "Guardar"}</button>
          <button type="button" disabled={isPending} onClick={() => { setEditing(false); setError(null); }} className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-600">Cancelar</button>
          <TaskCount count={tag.taskCount} />
        </div>
        {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      </form>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2 py-1">
        <div className="min-w-0 flex-1">
          <button
            type="button"
            disabled={!tag.canEdit || isPending}
            onClick={() => { setName(tag.name); setError(null); setEditing(true); }}
            aria-label={`Editar etiqueta ${label} de ${tag.projectName}`}
            className="max-w-full break-words text-left text-sm font-medium text-slate-800 enabled:hover:underline"
          >
            {label}
          </button>
          <p className="break-words text-xs text-slate-500">{tag.projectName}</p>
        </div>
        <TaskCount count={tag.taskCount} />
        {isAdmin && <ToolbarButton icon={<TrashIcon className="h-4 w-4" />} label={`Eliminar etiqueta ${label} de ${tag.projectName}`} onClick={handleDelete} disabled={isPending} danger />}
      </div>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
