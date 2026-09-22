"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Por debajo de lg el calendario solo ofrece la vista Día (Mes/Semana no entran bien en ese
// ancho, ver ProjectCalendarView) — si alguien carga o gira el celular estando en Mes/Semana,
// lo manda a Día. No hace nada si ya está en Día o si el ancho es de escritorio.
export function MobileCalendarDayEnforcer({ isDayMode, dayHref }: { isDayMode: boolean; dayHref: string }) {
  const router = useRouter();

  useEffect(() => {
    if (isDayMode) return;
    const mq = window.matchMedia("(max-width: 1023.98px)");
    function check() {
      if (mq.matches) router.replace(dayHref);
    }
    check();
    mq.addEventListener("change", check);
    return () => mq.removeEventListener("change", check);
  }, [isDayMode, dayHref, router]);

  return null;
}
