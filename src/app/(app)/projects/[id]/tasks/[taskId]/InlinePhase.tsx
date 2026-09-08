"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateTaskPhase } from "./actions";

export function InlinePhase({
  taskId,
  phaseId,
  phaseName,
  phases,
  canManage,
}: {
  taskId: string;
  phaseId: string;
  phaseName: string;
  phases: { id: string; name: string }[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!canManage) return <>{phaseName}</>;

  if (!editing) {
    return (
      <button
        type="button"
        title="Click para cambiar la fase"
        onClick={() => setEditing(true)}
        className="-mx-0.5 rounded px-0.5 hover:bg-slate-100 hover:underline"
      >
        {phaseName}
      </button>
    );
  }

  return (
    <select
      autoFocus
      defaultValue={phaseId}
      disabled={isPending}
      onBlur={() => setEditing(false)}
      onChange={(e) => {
        const value = e.target.value;
        startTransition(async () => {
          await updateTaskPhase(taskId, value);
          setEditing(false);
          router.refresh();
        });
      }}
      className="rounded border border-slate-300 px-1 py-0.5 text-sm text-slate-700"
    >
      {phases.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
