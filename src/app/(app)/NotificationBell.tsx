"use client";

import { AnchoredPopover, useAnchoredPopover } from "@/components/AnchoredPopover";
import Link from "next/link";
import { markNotificationRead, markAllNotificationsRead } from "./notificationActions";
import { BellIcon, XIcon } from "@/components/icons";
import { NOTIFICATION_TYPE_COLOR } from "@/lib/statusColors";
import type { NotificationType } from "@prisma/client";

export type NotificationItem = {
  id: string;
  message: string;
  type: NotificationType;
  taskId: string | null;
  projectId: string | null;
  credentialId?: string | null;
};

export function NotificationBell({ items }: { items: NotificationItem[] }) {
  const { anchorRef, panelRef, pos, toggle, close } = useAnchoredPopover(320);

  return (
    <div ref={anchorRef} className="relative">
      <button
        onClick={toggle}
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

      <AnchoredPopover pos={pos} panelRef={panelRef}>
          {items.length === 0 && (
            <p className="p-3 text-sm text-slate-400">Sin notificaciones pendientes.</p>
          )}
          {items.length > 0 && (
            <button
              onClick={() => markAllNotificationsRead()}
              className="mb-1 w-full rounded-lg px-2 py-1.5 text-left text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-900"
            >
              Marcar todas como leídas
            </button>
          )}
          {items.map((n) => (
            <div key={n.id} className="flex items-start gap-2 rounded-lg p-2 text-sm hover:bg-slate-50">
              <span
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${NOTIFICATION_TYPE_COLOR[n.type]}`}
                aria-hidden
              />
              <Link
                href={
                  n.credentialId
                    ? `/credentials/${n.credentialId}`
                    : n.taskId
                    ? `/projects/${n.projectId}/tasks/${n.taskId}`
                    : n.projectId
                      ? `/projects/${n.projectId}?view=definition`
                      : "#"
                }
                className="flex-1 text-slate-700"
                onClick={close}
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
      </AnchoredPopover>
    </div>
  );
}
