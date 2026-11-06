"use client";

import { useEffect, useState } from "react";
import { SearchableSelect } from "@/components/SearchableSelect";
import { listClientOptions } from "@/app/(app)/clients/actions";

export function ClientPicker({ clientId, clientName }: { clientId?: string | null; clientName?: string | null }) {
  const current = clientId && clientName ? [{ id: clientId, label: clientName }] : [];
  const [options, setOptions] = useState(current);

  useEffect(() => {
    listClientOptions()
      .then((list) => setOptions((prev) => [...prev.filter((p) => !list.some((o) => o.id === p.id)), ...list]))
      .catch(() => undefined);
  }, []);

  return (
    <SearchableSelect
      name="client"
      options={options}
      defaultValue={clientId ?? clientName ?? ""}
      allowCustom
      placeholder="Interno (sin cliente)"
      searchPlaceholder="Buscar o escribir un cliente nuevo…"
    />
  );
}
