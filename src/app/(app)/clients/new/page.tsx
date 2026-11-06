import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ClientForm } from "../ClientForm";

export default async function NewClientPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") {
    return (
      <div className="mx-auto max-w-xl rounded-3xl border border-slate-100 bg-white p-8 text-center">
        <p className="text-[17px] text-slate-700">Esta sección es solo para administradores.</p>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/company#clientes" className="text-sm text-slate-500 hover:text-slate-900">
        ← Empresa | Clientes
      </Link>
      <section className="rounded-3xl border border-slate-100 bg-white px-6 py-8 sm:px-10">
        <h1 className="mb-6 font-display text-2xl font-semibold tracking-[-0.02em] text-slate-900">Nuevo cliente</h1>
        <ClientForm id={null} />
      </section>
    </div>
  );
}
