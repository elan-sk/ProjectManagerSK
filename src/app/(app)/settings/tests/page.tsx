import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isReviewerAnywhere } from "@/lib/permissions";
import { getKnownCategories } from "@/lib/reviewCategories";
import { TestTemplatesPanel } from "./TestTemplatesPanel";
import { ResponseCategoriesPanel } from "./ResponseCategoriesPanel";

export default async function TestsSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const isAdmin = session.user.role === "ADMIN";

  const [templates, categories, canCreate, knownCategories] = await Promise.all([
    prisma.testTemplate.findMany({
      include: { items: { orderBy: { order: "asc" } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.responseCategory.findMany({
      include: { responses: true },
      orderBy: { name: "asc" },
    }),
    isReviewerAnywhere(),
    getKnownCategories(),
  ]);

  return (
    <div className="space-y-4">
      <p className="px-1 text-sm text-slate-500">
        Plantillas de pruebas para agilizar las revisiones, y categorías de respuesta para
        quien corrige. Crearlas y editarlas es de revisores, PM o administrador;
        eliminar definitivamente es solo del administrador.
      </p>

      <TestTemplatesPanel templates={templates} isAdmin={isAdmin} canCreate={canCreate} knownCategories={knownCategories} />
      <ResponseCategoriesPanel categories={categories} isAdmin={isAdmin} canCreate={canCreate} />
    </div>
  );
}
