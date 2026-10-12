"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CheckIcon } from "@/components/icons";

export type TabMenuItem = { label: string; href: string; active: boolean };

const ROW_ITEM = {
  tab: "flex-shrink-0 rounded-lg px-3 py-1.5",
  pill: "flex-shrink-0 rounded-lg px-2.5 py-1 text-xs",
} as const;

export function TabMenu({ items, prefix, variant = "tab" }: { items: TabMenuItem[]; prefix?: string; variant?: keyof typeof ROW_ITEM }) {
  const [open, setOpen] = useState(false);
  const [fitsLeft, setFitsLeft] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);

  function toggle() {
    const rect = rootRef.current?.getBoundingClientRect();
    if (rect) setFitsLeft(rect.left <= window.innerWidth / 2);
    setOpen((value) => !value);
  }
  const current = items.find((item) => item.active) ?? items[0];

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!current) return null;

  return (
    <>
      <div className={`hidden flex-nowrap lg:flex ${variant === "pill" ? "gap-1.5" : "gap-2"}`}>
        {items.map((item) => (
          <Link key={item.label} href={item.href} className={`${ROW_ITEM[variant]} ${item.active ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}>
            {item.label}
          </Link>
        ))}
      </div>
      <div ref={rootRef} className="relative min-w-0 lg:hidden">
        <button
          type="button"
          aria-expanded={open}
          onClick={toggle}
          className="flex w-full min-w-40 cursor-pointer items-center justify-between gap-2 rounded-lg bg-slate-900 px-3 py-1.5 text-left text-sm text-white"
        >
          <span className="min-w-0 truncate">
            {prefix && <span className="text-white/70">{prefix}: </span>}
            {current.label}
          </span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={`h-4 w-4 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
          </svg>
        </button>
        {open && (
          <div className={`absolute ${fitsLeft ? "left-0" : "right-0"} z-40 mt-1 max-h-[60vh] w-max min-w-full max-w-[calc(100vw-2rem)] overflow-x-hidden overflow-y-auto rounded-2xl bg-white p-1.5 shadow-[0_4px_8px_rgba(15,23,42,0.08),0_16px_40px_rgba(15,23,42,0.12)]`}>
            {items.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`flex items-center justify-between gap-4 rounded-lg px-2.5 py-2 text-sm ${item.active ? "bg-slate-100 font-medium text-slate-900" : "text-slate-600 hover:bg-slate-50"}`}
              >
                {item.label}
                {item.active && <CheckIcon className="h-4 w-4 flex-shrink-0" />}
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
