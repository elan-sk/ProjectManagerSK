import type { Metadata } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Voz tipográfica de títulos ("Bitácora de marea"): geométrica y con carácter
// propio, distinta de Geist (que sigue llevando toda la UI operativa/datos
// para no sacrificar legibilidad — ver DESIGN.md > Typography).
const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ProjectManagerSK",
  description: "Gestión de proyectos, tareas y cronogramas",
  manifest: "/manifest.json",
};

export const viewport = {
  themeColor: "#073b4c",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      // Extensiones del navegador (LanguageTool, Console Ninja…) agregan atributos
      // al <html> antes de que cargue React; sin esto salta un aviso de hidratación
      // en desarrollo. Solo aplica a los atributos de esta etiqueta, no a sus hijos.
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <script
          // ponytail: registro del SW en JS plano — no hace falta un
          // componente cliente aparte solo para esto.
          dangerouslySetInnerHTML={{
            __html: `if ('serviceWorker' in navigator) { window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js')); }`,
          }}
        />
        <script
          // Corrector ortográfico en todo campo de texto (inputs, textareas y
          // el editor enriquecido): Firefox no revisa los <input> de una línea
          // sin spellcheck explícito. Se activa al enfocar, sin tocar cada
          // formulario. Excluye email/url/password/número/fecha.
          dangerouslySetInnerHTML={{
            __html: `document.addEventListener('focusin', function (e) { var t = e.target; if (!(t instanceof HTMLElement) || t.hasAttribute('spellcheck')) return; var ok = t.isContentEditable || t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && (t.type === 'text' || t.type === 'search')); if (ok) { t.setAttribute('spellcheck', 'true'); } });`,
          }}
        />
        <script
          // Ctrl+B / Cmd+B en un campo de texto: envuelve la selección en *asteriscos*
          // (la app los muestra en negrita); sobre texto ya envuelto, los quita; sin
          // selección, inserta ** con el cursor en medio. No toca el editor enriquecido ni los campos
          // que ya lo atendieron con su propio onKeyDown (BoldButton.tsx): defaultPrevented.
          dangerouslySetInnerHTML={{
            __html: `document.addEventListener('keydown', function (e) { if (e.defaultPrevented || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'b') return; var t = e.target; if (!(t instanceof HTMLElement) || t.isContentEditable) return; if (!(t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && (t.type === 'text' || t.type === 'search')))) return; e.preventDefault(); var v = t.value, a = t.selectionStart, b = t.selectionEnd; while (a < b && /\\s/.test(v[a])) a++; while (b > a && /\\s/.test(v[b - 1])) b--; var sel = v.slice(a, b), from = a, to = b, out; if (sel.length > 1 && sel[0] === '*' && sel[sel.length - 1] === '*') { out = sel.slice(1, -1); } else if (a > 0 && v[a - 1] === '*' && v[b] === '*') { from = a - 1; to = b + 1; out = sel; } else { out = '*' + sel + '*'; } t.setSelectionRange(from, to); if (!document.execCommand('insertText', false, out)) { var proto = t.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(t, v.slice(0, from) + out + v.slice(to)); t.dispatchEvent(new Event('input', { bubbles: true })); } var c = from + out.length - (sel === '' && out === '**' ? 1 : 0); if (sel === '' ) c = from + 1; t.setSelectionRange(sel === '' ? c : from, sel === '' ? c : from + out.length); });`,
          }}
        />
      </body>
    </html>
  );
}
