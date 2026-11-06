import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser, safeJson } from "@/lib/apiAuth";
import { COMPANY_NAME_KEY, COMPANY_TOPIC_KEYS, getCompanyProfile, profileViewFor, saveCompanyTopic } from "@/lib/companyProfile";
import { brandView, getCompanyBrand } from "@/lib/companyBrand";

export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;
  return NextResponse.json({ ...profileViewFor(await getCompanyProfile(), auth.actor.role === "ADMIN"), identidad: brandView(await getCompanyBrand()) });
}

const patchSchema = z.object({ topic: z.enum([COMPANY_NAME_KEY, ...COMPANY_TOPIC_KEYS]), text: z.string().max(20000) });

export async function PATCH(request: Request) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;
  if (auth.actor.role !== "ADMIN") return NextResponse.json({ error: "Solo un administrador puede editar el perfil de la empresa." }, { status: 403 });
  const body = await safeJson(request);
  if ("error" in body) return body.error;
  const parsed = patchSchema.safeParse(body.data);
  if (!parsed.success) return NextResponse.json({ error: "Se espera { topic, text }; topic es name o uno de: " + COMPANY_TOPIC_KEYS.join(", ") }, { status: 400 });
  if (parsed.data.topic === COMPANY_NAME_KEY && !parsed.data.text.trim()) return NextResponse.json({ error: "Falta el nombre de la empresa." }, { status: 400 });
  await saveCompanyTopic(parsed.data.topic, parsed.data.text, auth.actor.id);
  return NextResponse.json(profileViewFor(await getCompanyProfile(), true));
}
