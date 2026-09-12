import { NextResponse } from "next/server";
import { resolveShareToken } from "@/lib/shareLinks";
import { saveUploadedFile } from "@/lib/uploadFile";

// Subida desde un link compartido (puntos 15/16) — sin sesión, el token del
// link ES la autorización (mismo criterio que el resto de /share/[token]).
// Un token inválido o revocado no sube nada.
export async function POST(request: Request) {
  const formData = await request.formData();
  const token = formData.get("token");
  if (typeof token !== "string" || !(await resolveShareToken(token))) {
    return NextResponse.json({ error: "Link inválido o vencido." }, { status: 403 });
  }

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });

  const result = await saveUploadedFile(file);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ url: result.url, name: result.name, mimeType: result.mimeType });
}
