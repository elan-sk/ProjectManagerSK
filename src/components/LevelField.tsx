import type { ReactNode } from "react";

export function LevelField({
  colorHex,
  colorClass = "",
  className = "",
  label,
  children,
}: {
  colorHex?: string;
  colorClass?: string;
  className?: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex max-w-full items-center gap-2 rounded-md border border-slate-200 bg-white py-1 pl-2.5 pr-3 text-sm ${colorClass} ${className}`}
      style={{ color: colorHex, borderLeftColor: "currentColor", borderLeftWidth: 3 }}
    >
      <span className="flex-shrink-0 font-semibold">{label}</span>
      <span className="h-3.5 w-px flex-shrink-0 bg-slate-300" aria-hidden />
      <span className="min-w-0 flex-1 text-slate-800">{children}</span>
    </span>
  );
}
