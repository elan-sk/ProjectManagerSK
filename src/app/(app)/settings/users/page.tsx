import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { UsersAdmin } from "../UsersAdmin";
import { AdminOnly } from "../SettingsCard";

export default async function UsersSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") return <AdminOnly />;
  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: { id: true, name: true, email: true, username: true, role: true, avatarUrl: true, phone: true, cargo: true, active: true },
  });
  return <UsersAdmin users={users} currentUserId={session.user.id} />;
}
