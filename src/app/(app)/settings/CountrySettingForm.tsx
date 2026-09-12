"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/Confirm";
import { useToast } from "@/components/Toast";
import { updateAppCountry } from "./actions";

type Country = { countryCode: string; name: string };

export function CountrySettingForm({ countries, currentCountryCode }: { countries: Country[]; currentCountryCode: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const showToast = useToast();
  const [value, setValue] = useState(currentCountryCode);
  const [isPending, startTransition] = useTransition();
  const knowsCurrent = countries.some((c) => c.countryCode === currentCountryCode);

  async function handleChange(countryCode: string) {
    const country = countries.find((c) => c.countryCode === countryCode);
    const ok = await confirm(
      `¿Cambiar el país a ${country?.name ?? countryCode}? Se van a recalcular los festivos y días hábiles de TODOS los proyectos con este país.`,
      { confirmLabel: "Sí, cambiar" }
    );
    if (!ok) return;
    setValue(countryCode);
    startTransition(async () => {
      const result = await updateAppCountry(countryCode);
      if (result.ok) {
        showToast("País actualizado.", "success");
        router.refresh();
      } else {
        showToast(result.error ?? "No se pudo cambiar el país.");
        setValue(currentCountryCode);
      }
    });
  }

  return (
    <select
      value={value}
      disabled={isPending}
      onChange={(e) => handleChange(e.target.value)}
      className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-60"
    >
      {!knowsCurrent && <option value={currentCountryCode}>{currentCountryCode}</option>}
      {countries.map((c) => (
        <option key={c.countryCode} value={c.countryCode}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
