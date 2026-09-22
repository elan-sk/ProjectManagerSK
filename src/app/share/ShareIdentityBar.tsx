"use client";

import { useState } from "react";
import { clearShareIdentity, saveShareIdentity, useShareIdentity } from "./shareIdentity";

// Identificación única del visitante externo, arriba de una lista de hilos
// (Cambios solicitados): los hilos la leen de shareIdentity y no la repiten.
export function ShareIdentityBar() {
  const identity = useShareIdentity();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");

  if (identity) {
    return (
      <p className="text-[17px] text-slate-500">
        Comentando como <span className="font-medium text-slate-700">{identity.name}</span>
        {identity.role && ` · ${identity.role}`} ·{" "}
        <button type="button" onClick={clearShareIdentity} className="hover:underline">
          cambiar
        </button>
      </p>
    );
  }

  function save() {
    if (name.trim()) saveShareIdentity({ name: name.trim(), role: role.trim() });
  }

  return (
    <div className="space-y-1.5 rounded-lg bg-slate-50 p-3">
      <p className="text-[17px] font-medium text-slate-600">Para comentar, primero se debe indicar quién escribe</p>
      <div className="flex flex-wrap gap-1.5">
        <input
          id="share-identity-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder="Nombre"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-[17px]"
        />
        <input
          value={role}
          onChange={(e) => setRole(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder="Cargo (opcional)"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-[17px]"
        />
        <button
          type="button"
          disabled={!name.trim()}
          onClick={save}
          className="flex-shrink-0 rounded-lg bg-slate-900 px-3 py-1.5 text-[17px] font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          Continuar
        </button>
      </div>
    </div>
  );
}
