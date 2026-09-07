import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { createProject } from "./actions";

export default async function ProjectsPage() {
  const [projects, users] = await Promise.all([
    prisma.project.findMany({ include: { pm: true }, orderBy: { createdAt: "desc" } }),
    prisma.user.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <h1 className="text-2xl font-semibold text-slate-900">Proyectos</h1>
        <ul className="mt-4 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {projects.length === 0 && (
            <li className="p-4 text-sm text-slate-500">Todavía no tenés proyectos.</li>
          )}
          {projects.map((p) => (
            <li key={p.id}>
              <Link
                href={`/projects/${p.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-slate-50"
              >
                <div>
                  <p className="font-medium text-slate-900">{p.name}</p>
                  <p className="text-sm text-slate-500">
                    {p.clientName ?? "Interno"} · PM: {p.pm.name}
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                  {p.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <form
        action={createProject}
        className="h-fit space-y-3 rounded-xl border border-slate-200 bg-white p-5"
      >
        <h2 className="font-medium text-slate-900">Nuevo proyecto</h2>

        <div className="space-y-1">
          <label className="text-sm text-slate-600">Nombre</label>
          <input
            name="name"
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm text-slate-600">Cliente (opcional)</label>
          <input
            name="clientName"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-sm text-slate-600">País (festivos)</label>
            <input
              name="countryCode"
              defaultValue="CO"
              maxLength={2}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-slate-600">Inicio</label>
            <input
              type="date"
              name="startDate"
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-sm text-slate-600">Product Manager</label>
          <select
            name="pmId"
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          className="w-full rounded-lg bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Crear proyecto
        </button>
      </form>
    </div>
  );
}
