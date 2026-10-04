import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Baileys (alertas de WhatsApp) hace imports opcionales (jimp/sharp) que
  // Turbopack intenta resolver en build aunque nunca se usen — se excluye
  // del bundling y se deja como require nativo de Node.
  serverExternalPackages: ["@whiskeysockets/baileys", "sharp", "pdfjs-dist"],
  // Los HTML subidos (prototipos) nunca se sirven sueltos: /uploads/<x>.html devuelve una página
  // envoltorio con el prototipo en un iframe con sandbox (ver src/lib/htmlShell.ts). beforeFiles
  // para ganarle a los archivos estáticos que Next ya conoce en public/uploads.
  // Los SVG que Next sirve directo desde public/uploads llevan la misma CSP que en /uploads/[name].
  async headers() {
    return [{ source: "/uploads/:file(.+\\.svg)", headers: [{ key: "Content-Security-Policy", value: "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:" }, { key: "X-Content-Type-Options", value: "nosniff" }] }];
  },
  async rewrites() {
    return { beforeFiles: [{ source: "/uploads/:file(.+\\.html)", destination: "/api/html/:file" }], afterFiles: [], fallback: [] };
  },
};

export default nextConfig;
