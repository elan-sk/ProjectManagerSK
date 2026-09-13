import Link from "next/link";
import { validateResetToken } from "../../forgotActions";
import { NewPasswordForm } from "./NewPasswordForm";

export default async function ResetTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = await validateResetToken(token);

  return (
    <main className="pacific-shell relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div className="relative w-full max-w-sm space-y-4 rounded-2xl border border-slate-200/80 bg-white p-8 shadow-[0_12px_32px_rgba(7,59,76,0.13)]">
        <div className="flex items-center gap-3">
          <span className="pacific-brand-mark" aria-hidden>
            <span className="relative z-10 text-xs font-bold">PM</span>
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-[-0.025em] text-slate-900">Elegir nueva contraseña</h1>
            <p className="text-xs text-slate-500">ProjectManagerSK</p>
          </div>
        </div>

        {valid ? (
          <NewPasswordForm token={token} />
        ) : (
          <>
            <p className="text-sm text-red-600">Este link venció o ya se usó.</p>
            <Link href="/login/recuperar" className="block text-sm text-slate-500 hover:underline">
              Pedir un link nuevo
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
