"use client";

import { useEffect, useState, useTransition } from "react";
import { connectWhatsApp, disconnectWhatsApp, whatsAppStatus, whatsAppGroups, updateDailyDigestTime, updateDefaultWhatsAppGroup, updateWorkHours, testWhatsAppDelivery } from "./whatsappActions";
import type { WhatsAppStatus } from "@/lib/whatsapp";

const SELECT_CLASS = "rounded-lg border border-slate-300 px-2 py-1.5 text-sm";

// Formato 12 h con AM/PM: 0 y 24 = medianoche, 12 = mediodía.
function hourLabel(h: number) {
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:00 ${h % 24 >= 12 ? "PM" : "AM"}`;
}

function HourSelect({ value, from, to, onChange }: { value: number; from: number; to: number; onChange: (h: number) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(Number(e.target.value))} className={SELECT_CLASS}>
      {Array.from({ length: to - from + 1 }, (_, i) => from + i).map((h) => (
        <option key={h} value={h}>
          {hourLabel(h)}
        </option>
      ))}
    </select>
  );
}

// Hora:minuto:AM/PM — el <input type="time"> nativo depende del idioma del
// navegador y no se puede forzar a 12 h. El valor sigue siendo "HH:MM" (24 h).
function Time12Select({ id, value, onChange }: { id?: string; value: string; onChange: (v: string) => void }) {
  const [h, m] = value.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  function emit(nextH12: number, nextM: number, nextPeriod: string) {
    const h24 = (nextH12 % 12) + (nextPeriod === "PM" ? 12 : 0);
    onChange(`${String(h24).padStart(2, "0")}:${String(nextM).padStart(2, "0")}`);
  }
  return (
    <div className="flex items-center gap-1">
      <select id={id} value={h12} onChange={(e) => emit(Number(e.target.value), m, period)} className={SELECT_CLASS}>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      <span className="text-slate-400">:</span>
      <select aria-label="Minutos" value={m} onChange={(e) => emit(h12, Number(e.target.value), period)} className={SELECT_CLASS}>
        {Array.from({ length: 60 }, (_, i) => i).map((n) => (
          <option key={n} value={n}>
            {String(n).padStart(2, "0")}
          </option>
        ))}
      </select>
      <select aria-label="AM o PM" value={period} onChange={(e) => emit(h12, m, e.target.value)} className={SELECT_CLASS}>
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}

export function WhatsAppConnectPanel({
  currentGroupJid,
  workHoursStart,
  workHoursEnd,
  dailyDigestHour,
  dailyDigestMinute,
}: {
  currentGroupJid: string | null;
  workHoursStart: number;
  workHoursEnd: number;
  dailyDigestHour: number;
  dailyDigestMinute: number;
}) {
  const [status, setStatus] = useState<WhatsAppStatus>("disconnected");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [groups, setGroups] = useState<{ id: string; name: string }[] | null>(null);
  // Controlado (no defaultValue): una revalidación del Server Action volvía
  // a montar el selector con el placeholder y hacía parecer que se perdió el
  // grupo guardado aunque siguiera en la base.
  const [selectedGroup, setSelectedGroup] = useState(currentGroupJid ?? "");
  const [groupError, setGroupError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [hours, setHours] = useState({ start: workHoursStart, end: workHoursEnd });
  const [hoursSaved, setHoursSaved] = useState(false);
  const [hoursError, setHoursError] = useState<string | null>(null);
  const [digestTime, setDigestTime] = useState(`${String(dailyDigestHour).padStart(2, "0")}:${String(dailyDigestMinute).padStart(2, "0")}`);
  const [digestSaved, setDigestSaved] = useState(false);
  const [digestError, setDigestError] = useState<string | null>(null);

  function refreshStatus() {
    return whatsAppStatus().then((s) => {
      setStatus(s.status);
      setQrDataUrl(s.qrDataUrl);
    });
  }

  function applyStatus(next: { status: WhatsAppStatus; qrDataUrl: string | null }) {
    setStatus(next.status);
    setQrDataUrl(next.qrDataUrl);
  }

  useEffect(() => {
    refreshStatus();
  }, []);

  // Sigue sondeando SIEMPRE, también ya "connected" — si no, una
  // desconexión real (se cierra sesión desde el teléfono, se cae el socket)
  // deja la pantalla congelada mostrando "Conectado" para siempre, sin forma
  // de llegar al botón "Conectar" sin recargar la página a mano.
  useEffect(() => {
    const interval = setInterval(refreshStatus, status === "connected" ? 8000 : 3000);
    return () => clearInterval(interval);
  }, [status]);

  useEffect(() => {
    if (status !== "connected" || groups) return;
    whatsAppGroups()
      .then(setGroups)
      .catch(() => setGroupError("No se pudieron cargar los grupos."));
  }, [status, groups]);

  return (
    <div className="space-y-4">
      {status === "connected" && <p className="text-sm text-emerald-600">Conectado.</p>}

      {(status === "connected" || status === "connecting") && (
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              try {
                setConnectionError(null);
                // Reflejar la desconexión en el instante en que el servidor
                // la confirma: no esperar al próximo poll para devolver el
                // botón "Conectar WhatsApp".
                applyStatus(await disconnectWhatsApp());
                setGroups(null);
                setGroupError(null);
              } catch {
                setConnectionError("No se pudo desconectar WhatsApp. Probá de nuevo.");
              }
            })
          }
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60 mr-3"
        >
          Desconectar
        </button>
      )}

      {status !== "connected" && (
        <button
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              try {
                setConnectionError(null);
                // La conexión real continúa de forma asíncrona (QR/open),
                // pero esta respuesta ya deja el panel en un estado que se
                // puede recuperar y el sondeo trae el QR apenas exista.
                applyStatus(await connectWhatsApp());
              } catch {
                setConnectionError("No se pudo iniciar la conexión. Probá de nuevo.");
              }
            })
          }
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {isPending || status === "connecting" ? "Conectando…" : "Conectar WhatsApp"}
        </button>
      )}

      {qrDataUrl && (
        <div className="space-y-1">
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL, no aplica optimización de next/image */}
          <img src={qrDataUrl} alt="Código QR de WhatsApp" className="h-56 w-56" />
          <p className="text-xs text-slate-400">
            Escaneá con WhatsApp desde el teléfono que va a mandar las alertas (WhatsApp → Dispositivos vinculados).
          </p>
        </div>
      )}
      {connectionError && <p className="text-xs text-red-600">{connectionError}</p>}

      {status === "connected" && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                setTestResult(null);
                const result = await testWhatsAppDelivery();
                setTestResult(result.ok ? "Prueba enviada a tu WhatsApp." : (result.error ?? "No se pudo entregar la prueba."));
              })
            }
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
          >
            Enviar prueba
          </button>
          {testResult && <span className="text-xs text-slate-500">{testResult}</span>}
        </div>
      )}

      {status === "connected" && (
        <div className="space-y-1">
          <label className="text-sm text-slate-600">Grupo por defecto (alertas de proyectos sin grupo propio)</label>
          {groupError && <p className="text-xs text-red-600">{groupError}</p>}
          <select
            value={selectedGroup}
            disabled={!groups}
            onChange={(e) => {
              const value = e.target.value;
              setSelectedGroup(value);
              startTransition(async () => {
                const result = await updateDefaultWhatsAppGroup(value);
                if (!result.ok) setSelectedGroup(currentGroupJid ?? "");
              });
            }}
            className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-60"
          >
            <option value="">— Sin grupo —</option>
            {groups?.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          {!groups && !groupError && <p className="text-xs text-slate-400">Cargando grupos…</p>}
        </div>
      )}

      <div className="space-y-1">
        <label className="text-sm text-slate-600">Horario laboral (envío de alertas por WhatsApp)</label>
        <div className="flex items-center gap-2">
          <HourSelect
            value={hours.start}
            from={0}
            to={23}
            onChange={(h) => {
              setHoursSaved(false);
              setHoursError(null);
              setHours((cur) => ({ ...cur, start: h }));
            }}
          />
          <span className="text-sm text-slate-500">a</span>
          <HourSelect
            value={hours.end}
            from={1}
            to={24}
            onChange={(h) => {
              setHoursSaved(false);
              setHoursError(null);
              setHours((cur) => ({ ...cur, end: h }));
            }}
          />
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const result = await updateWorkHours(hours.start, hours.end);
                setHoursSaved(result.ok);
                setHoursError(result.ok ? null : result.error);
              })
            }
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            Guardar
          </button>
          {hoursSaved && <span className="text-xs text-emerald-600">Guardado.</span>}
        </div>
        {hoursError && <p className="text-xs text-red-600">{hoursError}</p>}
        <p className="text-xs text-slate-400">Fuera de este rango (días hábiles, hora de Colombia), las alertas quedan en espera y salen al abrir el horario.</p>
      </div>

      <div className="space-y-1">
        <label htmlFor="daily-digest-time" className="text-sm text-slate-600">Hora exacta del resumen diario individual</label>
        <div className="flex flex-wrap items-center gap-2">
          <Time12Select
            id="daily-digest-time"
            value={digestTime}
            onChange={(v) => {
              setDigestTime(v);
              setDigestSaved(false);
              setDigestError(null);
            }}
          />
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const [hour, minute] = digestTime.split(":").map(Number);
                const result = await updateDailyDigestTime(hour, minute);
                setDigestSaved(result.ok);
                setDigestError(result.ok ? null : result.error);
              })
            }
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            Guardar
          </button>
          {digestSaved && <span className="text-xs text-emerald-600">Guardado.</span>}
        </div>
        {digestError && <p className="text-xs text-red-600">{digestError}</p>}
        <p className="text-xs text-slate-400">Elegí hora y minutos dentro del horario laboral. Se envía una vez por día hábil; si cambiás esta hora, se envía de nuevo en el nuevo horario.</p>
      </div>
    </div>
  );
}
