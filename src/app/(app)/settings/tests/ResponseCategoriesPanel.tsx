"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/Confirm";
import {
  createResponseCategory,
  updateResponseCategory,
  deleteResponseCategory,
  addResponseTemplate,
  updateResponseTemplate,
  deleteResponseTemplate,
} from "./testActions";

type Response = { id: string; text: string };
type Category = { id: string; name: string; responses: Response[] };

export function ResponseCategoriesPanel({ categories, isAdmin, canCreate }: { categories: Category[]; isAdmin: boolean; canCreate: boolean }) {
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
      const result = await createResponseCategory(formData);
      if (result.ok) {
        setName("");
        router.refresh();
      } else {
        setError(result.error ?? "No se pudo crear la categoría.");
      }
    });
  }

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="font-medium text-slate-900">Categorías y respuestas para quien corrige</h2>
      <div className="space-y-3">
        {categories.map((category) => (
          <CategoryCard key={category.id} category={category} isAdmin={isAdmin} />
        ))}
        {categories.length === 0 && <p className="text-sm text-slate-400">Sin categorías todavía.</p>}
      </div>
      {canCreate && (
        <div className="space-y-1.5 border-t border-slate-100 pt-3">
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder="Nombre de la categoría nueva…"
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

function CategoryCard({ category, isAdmin }: { category: Category; isAdmin: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [text, setText] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(category.name);
  const [isPending, startTransition] = useTransition();

  function handleAddResponse() {
    if (!text.trim()) return;
    startTransition(async () => {
      const formData = new FormData();
      formData.set("text", text);
      const result = await addResponseTemplate(category.id, formData);
      if (result.ok) {
        setText("");
        router.refresh();
      }
    });
  }

  async function handleSaveName() {
    if (!name.trim() || name === category.name) {
      setRenaming(false);
      return;
    }
    const result = await updateResponseCategory(category.id, name);
    if (result.ok) router.refresh();
    setRenaming(false);
  }

  async function handleDeleteCategory() {
    const ok = await confirm(`¿Seguro que querés eliminar la categoría "${category.name}" completa? No vas a poder deshacer esto.`, {
      confirmLabel: "Eliminar",
      danger: true,
    });
    if (!ok) return;
    await deleteResponseCategory(category.id);
    router.refresh();
  }

  async function handleDeleteResponse(responseId: string, responseText: string) {
    const ok = await confirm(`¿Seguro que querés eliminar definitivamente la respuesta "${responseText}"? No vas a poder deshacer esto.`, {
      confirmLabel: "Eliminar",
      danger: true,
    });
    if (!ok) return;
    const result = await deleteResponseTemplate(responseId);
    if (result.ok) router.refresh();
  }

  return (
    <div className="space-y-2 rounded-lg border border-slate-100 p-3">
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
            {category.name}
          </button>
        )}
        {isAdmin && (
          <button type="button" onClick={handleDeleteCategory} className="text-xs text-slate-400 hover:text-red-600">
            Eliminar categoría
          </button>
        )}
      </div>
      <ul className="space-y-1">
        {category.responses.map((response) => (
          <ResponseRow key={response.id} response={response} isAdmin={isAdmin} onDelete={handleDeleteResponse} />
        ))}
        {category.responses.length === 0 && <p className="text-xs text-slate-400">Sin respuestas todavía.</p>}
      </ul>
      <div className="flex gap-1.5">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAddResponse()}
          placeholder="Nueva respuesta predefinida…"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
        />
        <button
          type="button"
          disabled={isPending || !text.trim()}
          onClick={handleAddResponse}
          className="flex-shrink-0 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          Agregar
        </button>
      </div>
    </div>
  );
}

function ResponseRow({
  response,
  isAdmin,
  onDelete,
}: {
  response: Response;
  isAdmin: boolean;
  onDelete: (id: string, text: string) => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(response.text);

  async function handleSave() {
    if (!text.trim() || text === response.text) {
      setEditing(false);
      return;
    }
    const result = await updateResponseTemplate(response.id, text);
    if (result.ok) router.refresh();
    setEditing(false);
  }

  if (editing) {
    return (
      <li className="flex items-center gap-1.5 text-sm">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
          autoFocus
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1 text-xs"
        />
        <button type="button" onClick={handleSave} className="flex-shrink-0 text-xs text-slate-900 hover:underline">
          Guardar
        </button>
      </li>
    );
  }

  return (
    <li className="group flex items-start justify-between gap-2 text-sm text-slate-600">
      <span className="min-w-0 whitespace-pre-wrap">{response.text}</span>
      <span className="flex flex-shrink-0 items-center gap-2 opacity-0 group-hover:opacity-100">
        <button type="button" onClick={() => setEditing(true)} className="text-xs text-slate-400 hover:text-slate-700">
          Editar
        </button>
        {isAdmin && (
          <button type="button" onClick={() => onDelete(response.id, response.text)} className="text-xs text-slate-400 hover:text-red-600">
            Eliminar
          </button>
        )}
      </span>
    </li>
  );
}
