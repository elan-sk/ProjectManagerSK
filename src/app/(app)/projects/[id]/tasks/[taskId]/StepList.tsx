"use client";

import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { StepCheckbox } from "./StepCheckbox";
import { reorderSteps } from "./actions";

type Step = { id: string; description: string; done: boolean; attachments: { id: string; url: string; name: string; mimeType: string }[] };

function SortableStep({ step, canEdit, canAddFiles }: { step: Step; canEdit: boolean; canAddFiles: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id, disabled: !canEdit });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "relative z-10 rounded-lg bg-white shadow-md" : undefined}
    >
      <StepCheckbox
        stepId={step.id}
        description={step.description}
        done={step.done}
        canEdit={canEdit}
        canAddFiles={canAddFiles}
        attachments={step.attachments}
        dragHandle={
          canEdit && (
            <button
              type="button"
              {...attributes}
              {...listeners}
              aria-label="Arrastrar para reordenar"
              title="Arrastrar para reordenar"
              className="flex-shrink-0 cursor-grab touch-none text-slate-300 hover:text-slate-500 active:cursor-grabbing"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" />
                <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
                <circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
              </svg>
            </button>
          )
        }
      />
    </div>
  );
}

/** Checklist reordenable por arrastre: el orden se ve al instante y se guarda en el servidor; si falla, vuelve al anterior. */
export function StepList({ taskId, steps, canEdit, canAddFiles }: { taskId: string; steps: Step[]; canEdit: boolean; canAddFiles: boolean }) {
  const router = useRouter();
  const [items, setItems] = useState(steps);
  const [error, setError] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  // El servidor manda la verdad tras cada refresh (alta/baja/edición de pasos).
  const [prevSteps, setPrevSteps] = useState(steps);
  if (steps !== prevSteps) {
    setPrevSteps(steps);
    setItems(steps);
  }

  async function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const previous = items;
    const next = arrayMove(items, items.findIndex((s) => s.id === active.id), items.findIndex((s) => s.id === over.id));
    setItems(next);
    setError(null);
    try {
      await reorderSteps(taskId, next.map((s) => s.id));
      router.refresh();
    } catch (err) {
      setItems(previous);
      setError((err as Error).message || "No se pudo reordenar los pasos.");
    }
  }

  return (
    <div className="space-y-2">
      <DndContext id={`steps-${taskId}`} sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          {items.map((s) => (
            <SortableStep key={s.id} step={s} canEdit={canEdit} canAddFiles={canAddFiles} />
          ))}
        </SortableContext>
      </DndContext>
      {items.length === 0 && <p className="text-[18px] text-slate-400">Sin pasos todavía.</p>}
      {error && <p className="text-[17px] text-red-600">{error}</p>}
    </div>
  );
}
