"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TabMenu } from "@/components/TabMenu";

type Item = { label: string; href: string; adminOnly?: boolean; matches?: string[]; children?: { label: string; href: string }[] };

const ITEMS: Item[] = [
  { label: "Perfil", href: "/settings/profile" },
  { label: "Usuarios", href: "/settings/users", adminOnly: true },
  { label: "Horario", href: "/settings/schedule", adminOnly: true },
  { label: "Bot y WhatsApp", href: "/settings/bot-whatsapp", adminOnly: true },
  {
    label: "Tareas",
    href: "/settings/tags",
    matches: ["/settings/tags", "/settings/tests"],
    children: [
      { label: "Etiquetas", href: "/settings/tags" },
      { label: "Plantillas de pruebas", href: "/settings/tests" },
    ],
  },
  { label: "Integraciones", href: "/settings/integrations" },
  { label: "Copias de seguridad", href: "/settings/backups", adminOnly: true },
  { label: "Acerca de", href: "/settings/about" },
];

export function SettingsNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const items = ITEMS.filter((i) => isAdmin || !i.adminOnly);
  const isActive = (item: Item) => (item.matches ?? [item.href]).some((m) => pathname === m || pathname.startsWith(`${m}/`));

  return (
    <>
      <div className="lg:hidden">
        <TabMenu items={items.map((i) => ({ label: i.label, href: i.href, active: isActive(i) }))} />
      </div>
      <nav className="sticky top-20 hidden h-fit w-48 shrink-0 space-y-1 lg:block" aria-label="Secciones de Configuración">
        {items.map((item) => {
          const active = isActive(item);
          return (
            <div key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`block rounded-xl px-3 py-2 text-[15px] font-medium ${active ? "bg-white text-slate-900 shadow-[0_6px_18px_rgba(7,59,76,0.08)]" : "text-slate-600 hover:bg-white/70 hover:text-slate-900"}`}
              >
                {item.label}
              </Link>
              {active && item.children && (
                <div className="mt-1 ml-3 space-y-0.5 border-l border-slate-200 pl-3">
                  {item.children.map((c) => (
                    <Link key={c.href} href={c.href} className={`block rounded-lg px-2 py-1 text-sm ${pathname.startsWith(c.href) ? "font-semibold text-[#0a6b78]" : "text-slate-500 hover:text-slate-900"}`}>
                      {c.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </>
  );
}
