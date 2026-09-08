"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateTaskTitle } from "./actions";

export function InlineTitle({ taskId, title, canManage }: { taskId: string; title: string; canManage: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const skipBlurSave = useRef(false);

  if (!canManage) return <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>;

  if (!editing) {
    return (
      <h1
        role="button"
        tabIndex={0}
        title="Click para editar"
        onClick={() => {
          setValue(title);
          setError(null);
          setEditing(true);
        }}
        className="-mx-1 cursor-text rounded px-1 text-2xl font-semibold text-slate-900 hover:bg-slate-100"
      >
        {title}
      </h1>
    );
  }

  function save() {
    const trimmed = value.trim();
    if (!trimmed || trimmed === title) {
      setEditing(false);
      return;
    }
    startTransition(async () => {
      const result = await updateTaskTitle(taskId, trimmed);
      if (result.ok) {
        setEditing(false);
        router.refresh();
      } else {
        setError(result.error ?? "No se pudo guardar.");
      }
    });
  }

  return (
    <div className="space-y-1">
      <input
        autoFocus
        value={value}
        disabled={isPending}
        onChange={(e) => setValue(e.target.value)}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
          if (e.key === "Escape") {
            skipBlurSave.current = true;
            setValue(title);
            setEditing(false);
          }
        }}
        onBlur={() => {
          if (skipBlurSave.current) {
            skipBlurSave.current = false;
            return;
          }
          save();
        }}
        className="w-full rounded-lg border border-slate-300 px-2 py-1 text-2xl font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
