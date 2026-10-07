import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getCredentialDetails } from "../actions";
import { CredentialPageView } from "./CredentialPageView";

// Destino del aviso de credencial compartida (campana, push y WhatsApp). Solo la ve quien tiene
// acceso; para el resto es como si no existiera (mismo mensaje en ambos casos).
export default async function CredentialPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;
  const result = await getCredentialDetails(id);

  if (!result.ok) {
    return (
      <div className="mx-auto max-w-lg space-y-3 rounded-xl border border-slate-200 bg-white p-5">
        <h1 className="text-lg font-semibold text-slate-900">Contraseña</h1>
        <p className="text-sm text-slate-600">{result.error}</p>
        <Link href="/agenda" className="text-sm text-slate-500 underline hover:text-slate-800">
          Volver a la agenda
        </Link>
      </div>
    );
  }

  // Abrirla deja leído su aviso de la campana.
  await prisma.notification
    .updateMany({ where: { userId: session.user.id, credentialId: id, read: false }, data: { read: true } })
    .catch((err) => console.error("[contraseñas] no se pudo marcar el aviso como leído", err));

  const { credential } = result;
  return (
    <div className="mx-auto max-w-lg space-y-3">
      <Link href={`/projects/${credential.projectId}?view=files&fileType=credential`} className="text-sm text-slate-500 hover:underline">
        ← {credential.projectName}
      </Link>
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <CredentialPageView credential={credential} />
      </div>
    </div>
  );
}
