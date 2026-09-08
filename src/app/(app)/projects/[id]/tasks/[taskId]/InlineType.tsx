"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateTaskType } from "./actions";
import { TASK_TYPE_LABEL } from "@/lib/statusColors";

export function InlineType({ taskId, type, canManage }: { taskId: string; type: string; canManage: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const label = TASK_TYPE_LABEL[type] ?? type;

  if (!canManage) return <>{label}</>;

  if (!editing) {
    return (
      <button
        type="button"
        title="Click para cambiar el tipo"
        onClick={() => setEditing(true)}
        className="-mx-0.5 rounded px-0.5 hover:bg-slate-100 hover:underline"
      >
        {label}
      </button>
    );
  }

  return (
    <select
      autoFocus
      defaultValue={type}
      disabled={isPending}
      onBlur={() => setEditing(false)}
      onChange={(e) => {
        const value = e.target.value;
        startTransition(async () => {
          await updateTaskType(taskId, value);
          setEditing(false);
          router.refresh();
        });
      }}
      className="rounded border border-slate-300 px-1 py-0.5 text-sm text-slate-700"
    >
      {Object.entries(TASK_TYPE_LABEL).map(([value, l]) => (
        <option key={value} value={value}>
          {l}
        </option>
      ))}
    </select>
  );
}
