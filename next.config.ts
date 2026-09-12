import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Baileys (alertas de WhatsApp) hace imports opcionales (jimp/sharp) que
  // Turbopack intenta resolver en build aunque nunca se usen — se excluye
  // del bundling y se deja como require nativo de Node.
  serverExternalPackages: ["@whiskeysockets/baileys"],
};

export default nextConfig;
