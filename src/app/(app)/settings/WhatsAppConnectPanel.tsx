"use client";

import { useEffect, useState, useTransition } from "react";
import { connectWhatsApp, whatsAppStatus, whatsAppGroups, updateDefaultWhatsAppGroup, updateWorkHours } from "./whatsappActions";
import type { WhatsAppStatus } from "@/lib/whatsapp";

export function WhatsAppConnectPanel({
  currentGroupJid,
  workHoursStart,
  workHoursEnd,
}: {
  currentGroupJid: string | null;
  workHoursStart: number;
  workHoursEnd: number;
}) {
  const [status, setStatus] = useState<WhatsAppStatus>("disconnected");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [groups, setGroups] = useState<{ id: string; name: string }[] | null>(null);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [hours, setHours] = useState({ start: workHoursStart, end: workHoursEnd });
  const [hoursSaved, setHoursSaved] = useState(false);

  useEffect(() => {
    whatsAppStatus().then((s) => {
      setStatus(s.status);
      setQrDataUrl(s.qrDataUrl);
    });
  }, []);

  useEffect(() => {
    if (status === "connected") return;
    const interval = setInterval(() => {
      whatsAppStatus().then((s) => {
        setStatus(s.status);
        setQrDataUrl(s.qrDataUrl);
      });
    }, 3000);
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

      {status !== "connected" && (
        <button
          disabled={isPending}
          onClick={() => startTransition(() => connectWhatsApp())}
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

      {status === "connected" && (
        <div className="space-y-1">
          <label className="text-sm text-slate-600">Grupo por defecto (alertas de proyectos sin grupo propio)</label>
          {groupError && <p className="text-xs text-red-600">{groupError}</p>}
          <select
            defaultValue={currentGroupJid ?? ""}
            disabled={!groups}
            onChange={(e) => {
              const value = e.target.value;
              startTransition(async () => {
                await updateDefaultWhatsAppGroup(value);
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
              })
            }
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            Guardar
          </button>
          {hoursSaved && <span className="text-xs text-emerald-600">Guardado.</span>}
        </div>
        <p className="text-xs text-slate-400">Fuera de este rango (días hábiles, hora de Colombia), las alertas quedan en espera y salen al abrir el horario.</p>
      </div>
    </div>
  );
}
