import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { saveUploadedFile } from "@/lib/uploadFile";

// ponytail: guarda en public/uploads/ para el prototipo local. Al pasar a
// Hostinger/producción, cambiar esto por un put() a Supabase Storage — el
// resto del flujo (Attachment.fileUrl) no cambia, solo saveUploadedFile.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });

  const result = await saveUploadedFile(file);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ url: result.url, name: result.name, mimeType: result.mimeType });
}
