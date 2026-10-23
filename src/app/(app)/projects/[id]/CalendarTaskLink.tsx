"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "@/lib/useAppRouter";
import { createPortal } from "react-dom";
import { AlertBadge } from "@/components/AlertBadge";
import { Avatar } from "@/components/Avatar";
import { ProjectIcon } from "@/components/ProjectIcon";
import { PaperclipIcon, ShareIcon, UrgentIcon } from "@/components/icons";
import { ReviewStateBadge, TaskStatusIcon } from "@/components/TaskIndicators";
import { TASK_STATUS_COLOR, TASK_STATUS_LABEL, TASK_TYPE_BADGE, TASK_TYPE_LABEL, type ReviewState } from "@/lib/statusColors";
import type { TaskAlert } from "@/lib/delays";
import type { TaskStatus } from "@prisma/client";

const POPOVER_WIDTH = 340;
const MIN_HEIGHT_BELOW = 320;
const MAX_AVATARS = 5;

export type CalendarPopoverTask = {
  title: string;
  type: string;
  status: TaskStatus;
  reviewState: ReviewState | null;
  isUrgent: boolean;
  projectName: string;
  projectIconUrl: string | null;
  projectParent: { id: string; name: string; iconUrl: string | null } | null;
  phaseName: string | null;
  requirementTitles: string[];
  assignees: { name: string; avatarUrl: string | null }[];
  attachmentsCount: number;
  coverUrl: string | null;
  shareToken: string | null;
};

type Position = { left: number; top?: number; bottom?: number; maxHeight: number };

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-start gap-x-2">
      <dt className="text-slate-400">{label}</dt>
      <dd className="min-w-0 text-slate-700">{children}</dd>
    </div>
  );
}

export function CalendarTaskLink({
  href,
  task,
  start,
  end,
  alert,
  collisionText,
  className,
  children,
}: {
  href: string;
  task: CalendarPopoverTask;
  start: Date;
  end: Date;
  alert: TaskAlert;
  collisionText: string | null;
  className: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const ref = useRef<HTMLAnchorElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const touchRef = useRef(false);
  const [pos, setPos] = useState<Position | null>(null);
  const [touchOpen, setTouchOpen] = useState(false);

  useEffect(() => {
    if (!touchOpen) return;
    function close() {
      setPos(null);
      setTouchOpen(false);
    }
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (ref.current?.contains(target) || popoverRef.current?.contains(target)) return;
      close();
    }
    function onScroll(e: Event) {
      if (popoverRef.current?.contains(e.target as Node)) return;
      close();
    }
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [touchOpen]);

  function show() {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(POPOVER_WIDTH, window.innerWidth - 16);
    const left = clamp(rect.left, 8, window.innerWidth - width - 8);
    const below = window.innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    setPos(
      below >= MIN_HEIGHT_BELOW || below >= above
        ? { left, top: rect.bottom + 6, maxHeight: below }
        : { left, bottom: window.innerHeight - rect.top + 6, maxHeight: above }
    );
  }
  function hide() {
    if (touchOpen) return;
    setPos(null);
  }

  const urgent = task.isUrgent && task.status !== "COMPLETED";
  const projectLabel = task.projectParent ? `${task.projectParent.name} › ${task.projectName}` : task.projectName;
  const shownAssignees = task.assignees.slice(0, MAX_AVATARS);

  return (
    <>
      <Link
        ref={ref}
        href={href}
        onPointerDown={(e) => {
          touchRef.current = e.pointerType === "touch";
        }}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={(e) => {
          if (!touchRef.current || touchOpen) return;
          e.preventDefault();
          show();
          setTouchOpen(true);
        }}
        className={className}
      >
        {children}
      </Link>

      {pos &&
        createPortal(
          <div
            ref={popoverRef}
            role="tooltip"
            onClick={() => router.push(href)}
            className={`${touchOpen ? "cursor-pointer overflow-y-auto" : "pointer-events-none overflow-y-hidden"} fixed z-50 max-w-[calc(100vw-16px)] overflow-x-hidden rounded-2xl bg-white text-[13px] shadow-[0_4px_8px_rgba(15,23,42,0.08),0_16px_40px_rgba(15,23,42,0.12)] ring-1 ring-slate-200`}
            style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width: POPOVER_WIDTH, maxHeight: pos.maxHeight }}
          >
            <div className={`h-1.5 ${urgent ? "bg-red-600" : TASK_STATUS_COLOR[task.status].dot}`} aria-hidden />
            {task.coverUrl && (
              // Portada bajo la franja del estado, alto fijo para que el cálculo de posición no cambie al cargar.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={task.coverUrl} alt="" className="block h-32 w-full object-cover" />
            )}
            <div className="space-y-3 p-4">
              <div className="flex items-center gap-2">
                <ProjectIcon name={task.projectName} iconUrl={task.projectIconUrl} parent={task.projectParent ?? undefined} size="h-7 w-7 flex-shrink-0 text-[11px]" />
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-500">{projectLabel}</span>
                <span className={`flex-shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${TASK_TYPE_BADGE[task.type] ?? ""}`}>{TASK_TYPE_LABEL[task.type] ?? task.type}</span>
              </div>

              <p className={`flex items-start gap-1.5 text-[16px] font-semibold leading-snug ${urgent ? "text-red-700" : "text-slate-900"}`}>
                {urgent && <UrgentIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />}
                <span className="min-w-0 break-words">{task.title}</span>
              </p>

              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ring-slate-900/10 ${TASK_STATUS_COLOR[task.status].badge}`}>
                  <TaskStatusIcon status={task.status} className="mr-1 h-3.5 w-3.5" />
                  {TASK_STATUS_LABEL[task.status]}
                </span>
                {task.reviewState && <ReviewStateBadge state={task.reviewState} />}
                <AlertBadge alert={alert} />
              </div>

              <dl className="space-y-1.5 border-t border-slate-100 pt-3">
                <Row label="Fechas">
                  <span className="capitalize">{fmtDate(start)}</span> — <span className="capitalize">{fmtDate(end)}</span>
                  {alert.level === "onTrack" && <span className="text-slate-400"> · vence en {alert.daysRemaining}d</span>}
                </Row>
                {task.phaseName && <Row label="Fase">{task.phaseName}</Row>}
                {task.requirementTitles.length > 0 && (
                  <Row label={task.requirementTitles.length > 1 ? "Requerimientos" : "Requerimiento"}>
                    <span className="line-clamp-3">{task.requirementTitles.join(" · ")}</span>
                  </Row>
                )}
                <Row label="Responsables">
                  {task.assignees.length === 0 ? (
                    <span className="text-slate-400">Sin responsable</span>
                  ) : (
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="flex -space-x-1.5">
                        {shownAssignees.map((a) => (
                          <Avatar key={a.name} name={a.name} avatarUrl={a.avatarUrl} size="h-6 w-6 text-[10px]" />
                        ))}
                      </span>
                      <span className="min-w-0">
                        {shownAssignees.map((a) => a.name.split(" ")[0]).join(", ")}
                        {task.assignees.length > MAX_AVATARS && ` +${task.assignees.length - MAX_AVATARS}`}
                      </span>
                    </span>
                  )}
                </Row>
              </dl>

              {(task.attachmentsCount > 0 || task.shareToken || collisionText) && (
                <div className="space-y-1.5 border-t border-slate-100 pt-3 text-xs text-slate-500">
                  {(task.attachmentsCount > 0 || task.shareToken) && (
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      {task.attachmentsCount > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <PaperclipIcon className="h-3.5 w-3.5" />
                          {task.attachmentsCount} {task.attachmentsCount === 1 ? "archivo" : "archivos"}
                        </span>
                      )}
                      {task.shareToken && (
                        <span className="inline-flex items-center gap-1">
                          <ShareIcon className="h-3.5 w-3.5" />
                          Compartida
                        </span>
                      )}
                    </p>
                  )}
                  {collisionText && <p className="text-indigo-600">{collisionText}</p>}
                </div>
              )}

              {touchOpen && (
                <Link href={href} onClick={(e) => e.stopPropagation()} className="block rounded-lg bg-slate-900 px-3 py-2 text-center text-sm font-medium text-white">
                  Abrir tarea
                </Link>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
