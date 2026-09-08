import Link from "next/link";
import { TASK_STATUS_LABEL, TASK_STATUS_COLOR } from "@/lib/statusColors";
import type { TaskStatus } from "@prisma/client";

// A diferencia de un filtro genérico (que solo distingue activo/inactivo),
// cada píldora de estado lleva su propio color reconocible siempre — no
// solo cuando está seleccionada — para reforzar la asociación color↔estado.
export function StatusFilterPill({ status, active, href }: { status: TaskStatus; active: boolean; href: string }) {
  const color = TASK_STATUS_COLOR[status];
  return (
    <Link
      href={href}
      className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
        active ? `${color.solid} text-white` : `${color.badge} hover:brightness-95`
      }`}
    >
      {TASK_STATUS_LABEL[status]}
    </Link>
  );
}
