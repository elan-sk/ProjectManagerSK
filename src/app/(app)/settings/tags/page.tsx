import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isPmOrAdminAnywhere, visibleProjectWhere, isProjectPm, PM_SCOPE_SELECT } from "@/lib/permissions";
import { summarizeTagCategories } from "@/lib/tagSummary";
import { TagCategoriesPanel } from "./TagCategoriesPanel";

export default async function TagsSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const isAdmin = session.user.role === "ADMIN";

  const [categories, canCreate] = await Promise.all([
    prisma.tagCategory.findMany({
      orderBy: { name: "asc" },
      include: { tags: {
        where: { project: visibleProjectWhere(session.user, { includeArchived: true }) },
        orderBy: [{ project: { name: "asc" } }, { name: "asc" }],
        select: { id: true, name: true, project: { select: { name: true, ...PM_SCOPE_SELECT } }, _count: { select: { taskTags: true } } },
      } },
    }),
    isPmOrAdminAnywhere(),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link href="/settings" className="text-sm text-slate-500 hover:underline">
        ← Configuración
      </Link>
      <h1 className="text-2xl font-semibold text-slate-900">Etiquetas</h1>
      <p className="text-sm text-slate-500">
        Categorías de etiqueta para seguir un mismo elemento (un componente, una fase de diseño) a través de varias
        tareas — la categoría (color + emoji) es global para todos los proyectos; el nombre de cada etiqueta se crea
        al vuelo dentro de una tarea y queda guardado solo para ese proyecto. Crear una categoría nueva es de PM o
        administrador; eliminar definitivamente es solo del administrador. Los contadores incluyen tareas completadas y archivadas de los proyectos visibles.
      </p>

      <TagCategoriesPanel categories={summarizeTagCategories(categories.map(category => ({ ...category, tags: category.tags.map(tag => ({ ...tag, canEdit: isAdmin || isProjectPm(tag.project, session.user.id) })) })))} isAdmin={isAdmin} canCreate={canCreate} />
    </div>
  );
}
