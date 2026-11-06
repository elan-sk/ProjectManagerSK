"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "@/lib/useAppRouter";
import { uploadWithProgress } from "@/lib/uploadWithProgress";
import { BRAND_FIELD_LABEL, BRAND_TEXT_FIELDS, type BrandInput, type CompanyBrandData } from "@/lib/companyBrandFields";
import { saveCompanyBrandAction } from "./actions";

const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml";
const INPUT = "block w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm";

function ImageField({ label, url, onChange }: { label: string; url: string | null; onChange: (url: string | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    try {
      const { ok, body } = await uploadWithProgress("/api/upload", form);
      if (!ok) throw new Error(body.error ?? "No se pudo subir la imagen.");
      onChange(body.url);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-1">
      <p className="text-sm font-medium text-slate-700">{label}</p>
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white">
          {url ? <img src={url} alt={label} className="max-h-12 max-w-24 object-contain" /> : <span className="text-xs text-slate-400">Sin imagen</span>}
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading} className="font-medium text-slate-700 hover:underline disabled:opacity-60">
            {uploading ? "Subiendo…" : url ? "Cambiar" : "Subir"}
          </button>
          {url && (
            <button type="button" onClick={() => onChange(null)} className="font-medium text-slate-500 hover:text-red-600">
              Quitar
            </button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={IMAGE_ACCEPT}
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = "";
          }}
        />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const valid = /^#[0-9a-f]{6}$/i.test(value);
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <span className="flex items-center gap-2">
        <input type="color" value={valid ? value : "#ffffff"} onChange={(e) => onChange(e.target.value.toUpperCase())} className="h-9 w-12 shrink-0 cursor-pointer rounded-lg border border-slate-300 bg-white p-0.5" aria-label={`${label}: elegir`} />
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder="#0A6B78" maxLength={7} className={`${INPUT} font-mono uppercase`} />
      </span>
    </label>
  );
}

export function CompanyBrandForm({ brand }: { brand: CompanyBrandData | null }) {
  const router = useRouter();
  const [logo, setLogo] = useState(brand?.logoPngUrl ?? null);
  const [icon, setIcon] = useState(brand?.iconPngUrl ?? null);
  const [primary, setPrimary] = useState(brand?.primaryColor ?? "");
  const [secondary, setSecondary] = useState(brand?.secondaryColor ?? "");
  const [fields, setFields] = useState(Object.fromEntries(BRAND_TEXT_FIELDS.map((f) => [f, brand?.[f] ?? ""])) as Record<(typeof BRAND_TEXT_FIELDS)[number], string>);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isSaving, startSaving] = useTransition();

  function save() {
    setError(null);
    setSaved(false);
    const input: BrandInput = { primaryColor: primary, secondaryColor: secondary, ...fields };
    if (logo !== (brand?.logoPngUrl ?? null)) input.logoUrl = logo;
    if (icon !== (brand?.iconPngUrl ?? null)) input.iconUrl = icon;
    startSaving(async () => {
      const result = await saveCompanyBrandAction(input);
      if (!result.ok) return setError(result.error);
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl font-semibold tracking-[-0.02em] text-slate-900">Identidad</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <ImageField label="Logo" url={logo} onChange={setLogo} />
        <ImageField label="Ícono" url={icon} onChange={setIcon} />
        <ColorField label="Color principal" value={primary} onChange={setPrimary} />
        <ColorField label="Color secundario" value={secondary} onChange={setSecondary} />
        {BRAND_TEXT_FIELDS.map((f) => (
          <label key={f} className={`block space-y-1 ${f === "legalName" || f === "address" ? "sm:col-span-2" : ""}`}>
            <span className="text-sm font-medium text-slate-700">{BRAND_FIELD_LABEL[f]}</span>
            <input type={f === "email" ? "email" : "text"} value={fields[f]} onChange={(e) => setFields((prev) => ({ ...prev, [f]: e.target.value }))} maxLength={190} className={INPUT} />
          </label>
        ))}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {saved && !error && <p className="text-xs text-emerald-700">Identidad guardada.</p>}
      <div className="flex justify-end">
        <button type="button" onClick={save} disabled={isSaving} className="rounded-full bg-[#073b4c] px-5 py-2 text-sm font-semibold text-white hover:bg-[#0a6b78] disabled:opacity-60">
          {isSaving ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </div>
  );
}
