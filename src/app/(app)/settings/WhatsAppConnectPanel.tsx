"use client";

import { useEffect, useState, useTransition } from "react";
import { connectWhatsApp, disconnectWhatsApp, whatsAppStatus, whatsAppGroups, updateDailyDigestTime, updateDefaultWhatsAppGroup, updateWorkHours, testWhatsAppDelivery } from "./whatsappActions";
import type { WhatsAppStatus } from "@/lib/whatsapp";

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
                setTestResult(result.ok ? "Prueba de alerta alta enviada al grupo." : (result.error ?? "No se pudo entregar la prueba."));
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
          <input
            type="number"
            min={0}
            max={23}
            value={hours.start}
            onChange={(e) => {
              setHoursSaved(false);
              setHoursError(null);
              setHours((h) => ({ ...h, start: Number(e.target.value) }));
            }}
            className="w-20 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          />
          <span className="text-sm text-slate-500">a</span>
          <input
            type="number"
            min={1}
            max={24}
            value={hours.end}
            onChange={(e) => {
              setHoursSaved(false);
              setHoursError(null);
              setHours((h) => ({ ...h, end: Number(e.target.value) }));
            }}
            className="w-20 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
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
          <input
            id="daily-digest-time"
            type="time"
            min={`${String(workHoursStart).padStart(2, "0")}:00`}
            max={`${String(workHoursEnd - 1).padStart(2, "0")}:59`}
            step={60}
            value={digestTime}
            onChange={(e) => {
              setDigestTime(e.target.value);
              setDigestSaved(false);
              setDigestError(null);
            }}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
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
