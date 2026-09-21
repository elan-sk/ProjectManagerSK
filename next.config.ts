import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Baileys (alertas de WhatsApp) hace imports opcionales (jimp/sharp) que
  // Turbopack intenta resolver en build aunque nunca se usen — se excluye
  // del bundling y se deja como require nativo de Node.
  serverExternalPackages: ["@whiskeysockets/baileys", "sharp", "pdfjs-dist"],
  // Los HTML subidos (prototipos) nunca corren con el origen de la app: si
  // Next los sirve directo desde public/uploads, igual salen aislados.
  async headers() {
    return [{ source: "/uploads/:file(.+\\.html)", headers: [{ key: "Content-Security-Policy", value: "sandbox allow-scripts allow-forms allow-popups" }] }];
  },
};

export default nextConfig;
