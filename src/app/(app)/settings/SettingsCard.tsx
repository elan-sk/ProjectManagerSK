export function SettingsCard({ title, children, id }: { title?: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="scroll-mt-20 space-y-4 rounded-3xl border border-slate-100 bg-white px-6 py-7 sm:px-8">
      {title && <h2 className="font-display text-2xl font-semibold tracking-[-0.02em] text-slate-900">{title}</h2>}
      {children}
    </section>
  );
}

export function AdminOnly() {
  return (
    <SettingsCard>
      <p className="text-[17px] text-slate-700">Esta sección es solo para administradores.</p>
    </SettingsCard>
  );
}
