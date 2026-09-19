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
      </body>
    </html>
  );
}
