import { NextResponse } from "next/server";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { auth } from "@/auth";

// ponytail: guarda en public/uploads/ para el prototipo local. Al pasar a
// Hostinger/producción, cambiar esto por un put() a Supabase Storage — el
// resto del flujo (Attachment.fileUrl) no cambia, solo esta función.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });

  const ext = path.extname(file.name);
  const fileName = `${randomUUID()}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(process.cwd(), "public/uploads", fileName), buffer);

  return NextResponse.json({
    url: `/uploads/${fileName}`,
    name: file.name,
    mimeType: file.type,
  });
}
