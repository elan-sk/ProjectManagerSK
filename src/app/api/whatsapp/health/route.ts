import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getWhatsAppHealth } from "@/lib/whatsapp";

// Solo el administrador ve la salud de la conexión de WhatsApp (alarma del header).
export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  return NextResponse.json(getWhatsAppHealth());
}
