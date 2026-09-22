"use client";

import { LinkifyBold } from "@/lib/linkify";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/Confirm";
import {
  createTestTemplate,
  updateTestTemplate,
  deleteTestTemplate,
  addTestTemplateItem,
  updateTestTemplateItem,
  deleteTestTemplateItem,
} from "./testActions";

type Item = { id: string; title: string; criteria: string | null; category: string | null };
type Template = { id: string; name: string; items: Item[] };

// Mismas categorías que ya se usan en Aceptación (ReviewCheck.category) y en otras
// plantillas de QA, en un único <datalist> que referencian todos los inputs de categoría.
const CATEGORY_DATALIST_ID = "qa-template-category-options";

export function TestTemplatesPanel({ templates, isAdmin, canCreate, knownCategories }: { templates: Template[]; isAdmin: boolean; canCreate: boolean; knownCategories: string[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleCreate() {
    if (!name.trim()) return;
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("name", name);
      const result = await createTestTemplate(formData);
      if (result.ok) {
        setName("");
        router.refresh();
      } else {
        setError(result.error ?? "No se pudo crear la plantilla.");
      }
    });
  }

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="font-medium text-slate-900">Plantillas de pruebas</h2>
      <datalist id={CATEGORY_DATALIST_ID}>
        {knownCategories.map((c) => <option key={c} value={c} />)}
      </datalist>
      <div className="space-y-4">
        {templates.map((template) => (
          <TemplateCard key={template.id} template={template} isAdmin={isAdmin} />
        ))}
        {templates.length === 0 && <p className="text-sm text-slate-400">Sin plantillas todavía.</p>}
      </div>
      {canCreate && (
        <div className="space-y-1.5 border-t border-slate-100 pt-3">
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder="Nombre de la plantilla nueva…"
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
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

function TemplateCard({ template, isAdmin }: { template: Template; isAdmin: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(template.name);
  const [adding, setAdding] = useState(false);

  // Agrupar por categoría para que se lea como secciones, no como una lista plana.
  const groups = new Map<string, Item[]>();
  for (const item of template.items) {
    const key = item.category?.trim() || "Sin categoría";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }

  async function handleDeleteTemplate() {
    const ok = await confirm(`¿Seguro que querés eliminar la plantilla "${template.name}" completa? No vas a poder deshacer esto.`, {
      confirmLabel: "Eliminar",
      danger: true,
    });
    if (!ok) return;
    await deleteTestTemplate(template.id);
    router.refresh();
  }

  async function handleSaveName() {
    if (!name.trim() || name === template.name) {
      setRenaming(false);
      return;
    }
    const result = await updateTestTemplate(template.id, name);
    if (result.ok) router.refresh();
    setRenaming(false);
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 p-3">
      <div className="flex items-center justify-between gap-2">
        {renaming ? (
          <div className="flex items-center gap-1.5">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
              autoFocus
              className="rounded-lg border border-slate-300 px-2 py-1 text-sm font-medium"
            />
            <button type="button" onClick={handleSaveName} className="text-xs text-slate-900 hover:underline">
              Guardar
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setRenaming(true)} className="text-sm font-medium text-slate-800 hover:underline">
            {template.name}
          </button>
        )}
        {isAdmin && (
          <button type="button" onClick={handleDeleteTemplate} className="text-xs text-slate-400 hover:text-red-600">
            Eliminar plantilla
          </button>
        )}
      </div>

      <div className="space-y-3">
        {Array.from(groups.entries()).map(([category, items]) => (
          <div key={category} className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{category}</p>
            <div className="space-y-1.5">
              {items.map((item) => (
                <ItemCard key={item.id} templateId={template.id} item={item} isAdmin={isAdmin} />
              ))}
            </div>
          </div>
        ))}
        {template.items.length === 0 && <p className="text-xs text-slate-400">Sin pruebas todavía.</p>}
      </div>

      {adding ? (
        <AddItemForm templateId={template.id} onDone={() => setAdding(false)} />
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="text-xs text-slate-500 hover:text-slate-800 hover:underline">
          + Agregar prueba
        </button>
      )}
    </div>
  );
}

function ItemCard({ templateId, item, isAdmin }: { templateId: string; item: Item; isAdmin: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);

  async function handleDelete() {
    const ok = await confirm(`¿Seguro que querés eliminar definitivamente "${item.title}" de esta plantilla? No vas a poder deshacer esto.`, {
      confirmLabel: "Eliminar",
      danger: true,
    });
    if (!ok) return;
    const result = await deleteTestTemplateItem(item.id);
    if (result.ok) router.refresh();
  }

  if (editing) {
    return <ItemForm templateId={templateId} item={item} onDone={() => setEditing(false)} />;
  }

  return (
    <div className="group rounded-lg border border-slate-100 bg-slate-50/50 p-2.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-slate-800">{item.title}</p>
        <div className="flex flex-shrink-0 items-center gap-2 opacity-0 group-hover:opacity-100">
          <button type="button" onClick={() => setEditing(true)} className="text-xs text-slate-400 hover:text-slate-700">
            Editar
          </button>
          {isAdmin && (
            <button type="button" onClick={handleDelete} className="text-xs text-slate-400 hover:text-red-600">
              Eliminar
            </button>
          )}
        </div>
      </div>
      {item.criteria && (
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-slate-500">
          {item.criteria.split("\n").filter((line) => line.trim()).map((line, i) => (
            <li key={i}><LinkifyBold text={line} /></li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ItemForm({
  templateId,
  item,
  onDone,
}: {
  templateId: string;
  item?: Item;
  onDone: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(item?.title ?? "");
  const [category, setCategory] = useState(item?.category ?? "");
  const [criteria, setCriteria] = useState(item?.criteria ?? "");
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    if (!title.trim()) return;
    startTransition(async () => {
      const formData = new FormData();
      formData.set("title", title);
      formData.set("category", category);
      formData.set("criteria", criteria);
      const result = item ? await updateTestTemplateItem(item.id, formData) : await addTestTemplateItem(templateId, formData);
      if (result.ok) {
        router.refresh();
        onDone();
      }
    });
  }

  return (
    <div className="space-y-1.5 rounded-lg border border-slate-300 bg-white p-2.5">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Título corto (ej. Prueba de responsividad)"
        autoFocus
        className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm font-medium"
      />
      <input
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        placeholder="Categoría (ej. Responsividad)"
        list={CATEGORY_DATALIST_ID}
        className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
      />
      <textarea
        value={criteria}
        onChange={(e) => setCriteria(e.target.value)}
        placeholder={"Cosas puntuales a verificar, una por línea (opcional)\nEj: no se sale de la vista en móvil\nEj: no se sale de la vista en tablet"}
        rows={3}
        className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={isPending || !title.trim()}
          onClick={handleSave}
          className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          Guardar
        </button>
        <button type="button" onClick={onDone} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-500">
          Cancelar
        </button>
      </div>
    </div>
  );
}

function AddItemForm({ templateId, onDone }: { templateId: string; onDone: () => void }) {
  return <ItemForm templateId={templateId} onDone={onDone} />;
}
