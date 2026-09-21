"use client";

import { BoldButton, boldOnKeyDown } from "@/components/BoldButton";
import { useRef } from "react";

// Campo «Nuevo paso» del checklist (dentro de un form de servidor) con botón de negrita.
export function NewStepInput() {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-1 items-center rounded-lg border border-slate-300 pr-1">
      <input
        ref={ref}
        name="description"
        placeholder="Nuevo paso / prueba"
        required
        onKeyDown={boldOnKeyDown}
        className="min-w-0 flex-1 rounded-lg bg-transparent px-3 py-2 text-sm outline-none"
      />
      <BoldButton targetRef={ref} />
    </div>
  );
}
