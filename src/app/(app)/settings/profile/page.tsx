import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ChangePasswordForm } from "../ChangePasswordForm";
import { ProfileForm } from "../ProfileForm";
import { SettingsCard } from "../SettingsCard";

export default async function ProfileSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const me = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id }, select: { name: true, email: true, username: true, avatarUrl: true, phone: true } });
  return (
    <>
      <SettingsCard title="Mi cuenta">
        <ProfileForm name={me.name} username={me.username} email={me.email} phone={me.phone} avatarUrl={me.avatarUrl} />
      </SettingsCard>
      <SettingsCard title="Contraseña">
        <ChangePasswordForm />
      </SettingsCard>
    </>
  );
}
