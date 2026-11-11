import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isPmOrAdminAnywhere, visibleProjectWhere, managedProjectWhere, isProjectPm, PM_SCOPE_SELECT } from "@/lib/permissions";
import { summarizeTagCategories } from "@/lib/tagSummary";
import { TagCategoriesPanel } from "./TagCategoriesPanel";

export default async function TagsSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const isAdmin = session.user.role === "ADMIN";

  const [categories, canCreate, tagProjects] = await Promise.all([
    prisma.tagCategory.findMany({
      orderBy: { name: "asc" },
      include: { tags: {
        where: { project: visibleProjectWhere(session.user, { includeArchived: true }) },
        orderBy: [{ project: { name: "asc" } }, { name: "asc" }],
        select: { id: true, name: true, project: { select: { name: true, ...PM_SCOPE_SELECT } }, _count: { select: { taskTags: true } } },
      } },
    }),
    isPmOrAdminAnywhere(),
    // Proyectos donde la persona puede crear etiquetas (mismo permiso que renombrarlas).
    prisma.project.findMany({
      where: { AND: [visibleProjectWhere(session.user), ...(isAdmin ? [] : [managedProjectWhere(session.user.id)])] },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div className="space-y-4">
      <p className="px-1 text-sm text-slate-500">
        Categorías de etiqueta para seguir un mismo elemento (un componente, una fase de diseño) a través de varias
        tareas — la categoría (color + emoji) es global para todos los proyectos; el nombre de cada etiqueta se crea
        al vuelo dentro de una tarea y queda guardado solo para ese proyecto. Crear una categoría nueva es de PM o
        administrador; eliminar definitivamente es solo del administrador. Los contadores incluyen tareas completadas y archivadas de los proyectos visibles.
      </p>

      <TagCategoriesPanel categories={summarizeTagCategories(categories.map(category => ({ ...category, tags: category.tags.map(tag => ({ ...tag, canEdit: isAdmin || isProjectPm(tag.project, session.user.id) })) })))} isAdmin={isAdmin} canCreate={canCreate} tagProjects={tagProjects} />
    </div>
  );
}
