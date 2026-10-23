import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { credentialVisibleWhere } from "@/lib/credentials";
import { isProjectPm, LIVE_PROJECT_WHERE } from "@/lib/permissions";
import { CredentialsBoard, type BoardProject } from "./CredentialsBoard";

// Todas las contraseñas que la persona puede ver, agrupadas por proyecto (como las carpetas de LastPass).
// Misma regla que el buscador: credentialVisibleWhere y solo proyectos activos. La contraseña nunca viaja
// en la lista: se pide al copiarla o al abrirla.
export default async function CredentialsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user;

  const credentials = await prisma.credential.findMany({
    where: { AND: [credentialVisibleWhere(user), { project: LIVE_PROJECT_WHERE }] },
    select: {
      id: true,
      name: true,
      url: true,
      username: true,
      createdById: true,
      project: { select: { id: true, name: true, iconUrl: true, pmId: true, parent: { select: { name: true, iconUrl: true, pmId: true } } } },
    },
    orderBy: { name: "asc" },
  });

  const byProject = new Map<string, BoardProject>();
  for (const c of credentials) {
    const p = c.project;
    let group = byProject.get(p.id);
    if (!group) {
      group = { id: p.id, name: p.name, iconUrl: p.iconUrl, parent: p.parent && { name: p.parent.name, iconUrl: p.parent.iconUrl }, credentials: [] };
      byProject.set(p.id, group);
    }
    group.credentials.push({
      id: c.id,
      name: c.name,
      url: c.url,
      username: c.username,
      // Misma regla que canManageCredential (quien la creó, el PM del proyecto o un administrador).
      canManage: user.role === "ADMIN" || c.createdById === user.id || isProjectPm(p, user.id),
    });
  }
  const projects = [...byProject.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));

  return <CredentialsBoard projects={projects} />;
}
