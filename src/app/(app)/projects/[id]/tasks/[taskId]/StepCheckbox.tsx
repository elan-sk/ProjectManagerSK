"use client";

import { useRouter } from "next/navigation";
import { toggleStep } from "./actions";

export function StepCheckbox({
  stepId,
  description,
  done,
  canEdit,
}: {
  stepId: string;
  description: string;
  done: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();

  return (
    <label className={`flex items-center gap-2 text-sm text-slate-700 ${canEdit ? "" : "cursor-default"}`}>
      <input
        type="checkbox"
        defaultChecked={done}
        disabled={!canEdit}
        onChange={async (e) => {
          await toggleStep(stepId, e.target.checked);
          router.refresh();
        }}
        className="h-4 w-4 rounded border-slate-300 disabled:opacity-50"
      />
      <span className={done ? "text-slate-400 line-through" : ""}>{description}</span>
    </label>
  );
}
