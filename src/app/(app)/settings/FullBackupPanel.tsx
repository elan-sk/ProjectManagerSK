"use client";

import { useState } from "react";

export function FullBackupPanel() {
  const [confirmed, setConfirmed] = useState(false);

  return (
    <section className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
      <div>
        <h2 className="font-medium text-slate-900">Respaldo total</h2>
        <p className="mt-1 text-sm text-slate-600">
          Copia completa de la información de la aplicación: usuarios, proyectos, tareas, historial, configuración y datos relacionados.
        </p>
      </div>

      <a
        href="/api/backup/full"
        className="inline-block rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        Descargar respaldo total
      </a>

      <form
        action="/api/backup/full"
        method="post"
        encType="multipart/form-data"
        onSubmit={(event) => {
          if (!confirmed) event.preventDefault();
        }}
        className="space-y-2 border-t border-amber-200 pt-3"
      >
        <p className="text-sm font-medium text-slate-800">Restaurar respaldo total</p>
        <input
          type="file"
          name="file"
          accept="application/json"
          required
          className="block w-full text-sm text-slate-600 file:mr-2 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-100"
        />
        <input
          type="password"
          name="passphrase"
          autoComplete="off"
          placeholder="Clave del respaldo (solo si el archivo está cifrado)"
          className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700"
        />
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="confirmReplace"
            value="yes"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            className="mt-0.5 rounded border-slate-300"
          />
          <span>Entiendo que esta restauración reemplazará todos los datos actuales.</span>
        </label>
        <button
          type="submit"
          disabled={!confirmed}
          className="rounded-lg bg-red-700 px-3.5 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Restaurar y reemplazar todo
        </button>
      </form>

      <p className="text-xs text-amber-800">
        El archivo contiene información sensible, incluidos hashes de contraseña y credenciales vinculadas. Guárdalo en un lugar seguro.
        Los archivos subidos se respaldan aparte en <code>public/uploads</code> dentro del paquete de entrega.
      </p>
    </section>
  );
}
