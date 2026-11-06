import Link from "next/link";
import { getBotSettings } from "@/lib/botSettings";
import { SparklesIcon } from "@/components/icons";

export async function AssistantEntryButton({ href, label, hint, small = false }: { href: string; label: string; hint?: string; small?: boolean }) {
  const STYLE = small ? "inline-flex flex-shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-medium" : "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium";
  const bot = await getBotSettings();
  if (!bot.apiKeyConfigured) {
    return (
      <span title="Falta conectar un servicio de IA en Configuración → Bot" aria-disabled="true" className={`${STYLE} cursor-not-allowed border border-slate-200 text-slate-400`}>
        <SparklesIcon className={small ? "h-3.5 w-3.5" : "h-4 w-4"} />
        {label}
      </span>
    );
  }
  return (
    <Link href={href} data-feature-hint={hint} className={`${STYLE} border border-slate-300 bg-white text-slate-800 hover:border-[#0a6b78] hover:bg-slate-50`}>
      <SparklesIcon className={`${small ? "h-3.5 w-3.5" : "h-4 w-4"} text-[#0a6b78]`} />
      {label}
    </Link>
  );
}
