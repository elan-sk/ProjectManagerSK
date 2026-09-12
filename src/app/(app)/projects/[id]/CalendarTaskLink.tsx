"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertBadge } from "@/components/AlertBadge";
import type { TaskAlert } from "@/lib/delays";

// Mismo tooltip claro (fondo blanco, no el nativo oscuro del navegador) y
// mismo criterio de flip/clamp que el hover de las barras del Gantt
// (GanttBar.tsx) — pedido explícito del usuario de reusar ese patrón acá.
const TOOLTIP_WIDTH = 224; // w-56
const TOOLTIP_MAX_HEIGHT = 140;

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("es-CO", { day: "2-digit", month: "short", timeZone: "UTC" });
}

export function CalendarTaskLink({
  href,
  title,
  start,
  end,
  alert,
  collisionText,
  className,
  children,
}: {
  href: string;
  title: string;
  start: Date;
  end: Date;
  alert: TaskAlert;
  collisionText: string | null;
  className: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLAnchorElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  function show() {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const fitsBelow = window.innerHeight - rect.bottom >= TOOLTIP_MAX_HEIGHT + 8;
    const top = fitsBelow ? rect.bottom + 8 : rect.top - TOOLTIP_MAX_HEIGHT - 8;
    const left = clamp(rect.left, 8, window.innerWidth - TOOLTIP_WIDTH - 8);
    setPos({ left, top });
  }
  function hide() {
    setPos(null);
  }

  return (
    <>
      <Link ref={ref} href={href} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide} className={className}>
        {children}
      </Link>

      {pos &&
        createPortal(
          <div
            className="pointer-events-none fixed z-50 w-56 rounded-xl bg-white p-3 text-xs shadow-[0_4px_8px_rgba(15,23,42,0.08),0_16px_40px_rgba(15,23,42,0.12)]"
            style={{ left: pos.left, top: pos.top }}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium text-slate-900">{title}</p>
              <AlertBadge alert={alert} className="flex-shrink-0" />
            </div>
            <p className="mt-1 text-slate-500">
              {fmtDate(start)} — {fmtDate(end)}
              {alert.level === "onTrack" && ` · vence en ${alert.daysRemaining}d`}
            </p>
            {collisionText && <p className="mt-1 text-indigo-600">{collisionText}</p>}
          </div>,
          document.body
        )}
    </>
  );
}
