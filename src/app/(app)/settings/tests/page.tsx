import Link from "next/link";
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
    <div className="mx-auto max-w-4xl space-y-4">
      <Link href="/settings" className="text-sm text-slate-500 hover:underline">
        ← Configuración
      </Link>
      <h1 className="text-2xl font-semibold text-slate-900">Pruebas</h1>
      <p className="text-sm text-slate-500">
        Plantillas de pruebas para agilizar las revisiones, y categorías de respuesta para
        quien corrige. Cualquiera puede agregar o editar pruebas y respuestas; crear una
        plantilla o categoría nueva es de revisores, PM o administrador; eliminar
        definitivamente es solo del administrador.
      </p>

      <TestTemplatesPanel templates={templates} isAdmin={isAdmin} canCreate={canCreate} knownCategories={knownCategories} />
      <ResponseCategoriesPanel categories={categories} isAdmin={isAdmin} canCreate={canCreate} />
    </div>
  );
}
