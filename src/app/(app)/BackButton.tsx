"use client";

import { useRouter } from "next/navigation";
import { ArrowLeftIcon } from "@/components/icons";

/** Atrás real (historial del navegador), no un destino fijo. */
export function BackButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.back()}
      aria-label="Atrás"
      title="Atrás"
      className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100"
    >
      <ArrowLeftIcon className="h-5 w-5" />
    </button>
  );
}
