"use client";

import { useState } from "react";
import Link from "next/link";
import { markNotificationRead } from "./notificationActions";
import { BellIcon, XIcon } from "@/components/icons";

export type NotificationItem = {
  id: string;
  message: string;
  type: string;
  taskId: string | null;
  projectId: string | null;
};

export function NotificationBell({ items }: { items: NotificationItem[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-full p-1.5 text-slate-500 hover:bg-slate-100"
        aria-label="Notificaciones"
      >
        <BellIcon className="h-5 w-5" />
        {items.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-medium text-white">
            {items.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-10 mt-2 w-80 rounded-2xl bg-white p-2 shadow-[0_4px_8px_rgba(15,23,42,0.08),0_16px_40px_rgba(15,23,42,0.12)]">
          {items.length === 0 && (
            <p className="p-3 text-sm text-slate-400">Sin notificaciones pendientes.</p>
          )}
          {items.map((n) => (
            <div key={n.id} className="flex items-start gap-2 rounded-lg p-2 text-sm hover:bg-slate-50">
              <Link
                href={n.taskId ? `/projects/${n.projectId}/tasks/${n.taskId}` : "#"}
                className="flex-1 text-slate-700"
                onClick={() => setOpen(false)}
              >
                {n.message}
              </Link>
              <button
                onClick={() => markNotificationRead(n.id)}
                className="text-slate-400 hover:text-slate-900"
                aria-label="Descartar"
              >
                <XIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
