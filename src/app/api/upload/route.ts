import { NextResponse } from "next/server";
import { requireAnyUser } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { saveUploadedFile } from "@/lib/uploadFile";

// ponytail: guarda en public/uploads/ para el prototipo local. Al pasar a
// Hostinger/producción, cambiar esto por un put() a Supabase Storage — el
// resto del flujo (Attachment.fileUrl) no cambia, solo saveUploadedFile.
// Acepta sesión de navegador (app web) o token de login (skill) — ver
// requireAnyUser.
export async function POST(request: Request) {
  const auth = await requireAnyUser(request);
  if ("error" in auth) return auth.error;

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });

  // HTML: solo admin o PM de algún proyecto (ver saveUploadedFile).
  const allowHtml = auth.actor.role === "ADMIN" || Boolean(await prisma.project.findFirst({ where: { pmId: auth.actor.id }, select: { id: true } }));
  const result = await saveUploadedFile(file, { allowHtml });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ url: result.url, name: result.name, mimeType: result.mimeType });
}
