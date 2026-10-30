"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/lib/useAppRouter";
import { updateWhatsAppCloud, updateWhatsAppConnection, updateWhatsAppMonthlyLimit } from "./whatsappActions";

const INPUT = "w-full max-w-md rounded-lg border border-slate-300 px-3 py-1.5 text-sm";

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1">
      <label className="block text-sm text-slate-600">{label}</label>
      <div className="flex max-w-md items-center gap-2">
        <input readOnly value={value} className={`${INPUT} bg-slate-50 text-slate-600`} onFocus={(e) => e.currentTarget.select()} />
        <button
          type="button"
          onClick={() =>
            navigator.clipboard
              .writeText(value)
              .then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              })
              .catch(() => undefined)
          }
          className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
    </div>
  );
}

export function WhatsAppConnectionSettings({
  connection,
  phoneNumberId,
  accessTokenLast4,
  appSecretLast4,
  verifyToken,
  templateName,
  templateLang,
  lastError,
  webhookUrl,
  used,
  limit,
}: {
  connection: "qr" | "cloud";
  phoneNumberId: string;
  accessTokenLast4: string | null;
  appSecretLast4: string | null;
  verifyToken: string;
  templateName: string;
  templateLang: string;
  lastError: string | null;
  webhookUrl: string;
  used: number;
  limit: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState<string | null>(null);
  const [limitError, setLimitError] = useState<string | null>(null);
  const [limitSaved, setLimitSaved] = useState(false);

  return (
    <div className="space-y-4 border-b border-slate-100 pb-4">
      <div className="space-y-1">
        <label htmlFor="whatsapp-connection" className="block text-sm text-slate-600">
          Conexión
        </label>
        <select
          id="whatsapp-connection"
          data-feature-hint="whatsapp-cloud-connection"
          value={connection}
          disabled={isPending}
          onChange={(e) => {
            const mode = e.target.value as "qr" | "cloud";
            setError(null);
            startTransition(async () => {
              const result = await updateWhatsAppConnection(mode);
              if (!result.ok) setError(result.error);
              else router.refresh();
            });
          }}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm disabled:opacity-60"
        >
          <option value="qr">Código QR</option>
          <option value="cloud">API oficial de Meta</option>
        </select>
      </div>

      {connection === "cloud" && (
        <form
          className="space-y-3"
          action={(formData: FormData) => {
            setError(null);
            setConnected(null);
            startTransition(async () => {
              const result = await updateWhatsAppCloud({
                phoneNumberId: String(formData.get("phoneNumberId") ?? ""),
                accessToken: String(formData.get("accessToken") ?? ""),
                appSecret: String(formData.get("appSecret") ?? ""),
                templateName: String(formData.get("templateName") ?? ""),
                templateLang: String(formData.get("templateLang") ?? ""),
              });
              if (result.ok) {
                setConnected(`Conectado: ${result.displayNumber}${result.name ? ` (${result.name})` : ""}.`);
                router.refresh();
              } else setError(result.error);
            });
          }}
        >
          <div className="space-y-1">
            <label htmlFor="cloud-phone-id" className="block text-sm text-slate-600">
              Identificador del número de teléfono
            </label>
            <input id="cloud-phone-id" name="phoneNumberId" defaultValue={phoneNumberId} inputMode="numeric" autoComplete="off" className={INPUT} />
          </div>
          <div className="space-y-1">
            <label htmlFor="cloud-token" className="block text-sm text-slate-600">
              Token de acceso
            </label>
            <input
              id="cloud-token"
              name="accessToken"
              type="password"
              autoComplete="off"
              placeholder={accessTokenLast4 ? `Guardado: •••• ${accessTokenLast4}` : ""}
              className={INPUT}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="cloud-secret" className="block text-sm text-slate-600">
              Clave secreta de la app
            </label>
            <input
              id="cloud-secret"
              name="appSecret"
              type="password"
              autoComplete="off"
              placeholder={appSecretLast4 ? `Guardada: •••• ${appSecretLast4}` : ""}
              className={INPUT}
            />
          </div>
          <div className="flex max-w-md gap-2">
            <div className="flex-1 space-y-1">
              <label htmlFor="cloud-template" className="block text-sm text-slate-600">
                Nombre de la plantilla de aviso
              </label>
              <input id="cloud-template" name="templateName" defaultValue={templateName} autoComplete="off" className={INPUT} />
            </div>
            <div className="w-24 space-y-1">
              <label htmlFor="cloud-lang" className="block text-sm text-slate-600">
                Idioma
              </label>
              <input id="cloud-lang" name="templateLang" defaultValue={templateLang} autoComplete="off" className={INPUT} />
            </div>
          </div>
          <CopyField label="Dirección del webhook" value={webhookUrl} />
          <CopyField label="Token de verificación" value={verifyToken} />
          {connected && <p className="text-sm text-emerald-600">{connected}</p>}
          {!connected && !error && lastError && <p className="text-sm text-red-600">{lastError}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            disabled={isPending}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {isPending ? "Guardando…" : "Guardar"}
          </button>
        </form>
      )}
      {connection !== "cloud" && error && <p className="text-sm text-red-600">{error}</p>}

      <div className="space-y-1">
        <label htmlFor="whatsapp-limit" className="block text-sm text-slate-600">
          Tope de mensajes de WhatsApp por mes
        </label>
        <form
          className="flex items-center gap-2"
          action={(formData: FormData) => {
            setLimitError(null);
            setLimitSaved(false);
            startTransition(async () => {
              const result = await updateWhatsAppMonthlyLimit(Number(formData.get("limit")));
              if (!result.ok) setLimitError(result.error);
              else {
                setLimitSaved(true);
                router.refresh();
              }
            });
          }}
        >
          <input id="whatsapp-limit" type="number" name="limit" min={1} defaultValue={limit} className="w-28 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
          <button
            disabled={isPending}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            Guardar
          </button>
          {limitSaved && <span className="text-xs text-emerald-600">Guardado.</span>}
        </form>
        <p className={`text-xs ${used >= limit ? "text-red-600" : "text-slate-400"}`}>
          Enviados este mes: {used} / {limit}
        </p>
        {limitError && <p className="text-xs text-red-600">{limitError}</p>}
      </div>
    </div>
  );
}
