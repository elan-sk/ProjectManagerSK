import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { APP_SETTING_ID } from "@/lib/appSettings";
import { getCloudConfig } from "@/lib/whatsappCloud";
import { validWebhookSignature } from "@/lib/whatsappCloudFormat";
import { handleCloudIncoming, type CloudIncoming } from "@/lib/whatsappChat";

type WebhookBody = { entry?: { changes?: { field?: string; value?: { messages?: CloudIncoming[] } }[] }[] };

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const setting = await prisma.appSetting.findUnique({ where: { id: APP_SETTING_ID }, select: { cloudVerifyToken: true } });
  if (params.get("hub.mode") === "subscribe" && setting?.cloudVerifyToken && params.get("hub.verify_token") === setting.cloudVerifyToken) {
    return new Response(params.get("hub.challenge") ?? "", { status: 200, headers: { "content-type": "text/plain" } });
  }
  return NextResponse.json({ error: "No autorizado" }, { status: 403 });
}

export async function POST(request: Request) {
  const raw = await request.text();
  const config = await getCloudConfig();
  if (!config || !validWebhookSignature(raw, request.headers.get("x-hub-signature-256"), config.appSecret)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  let body: WebhookBody;
  try {
    body = JSON.parse(raw) as WebhookBody;
  } catch {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
  }
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;
      for (const message of change.value?.messages ?? []) {
        void handleCloudIncoming(config, message).catch((err) => console.error("[whatsapp-cloud] falló un mensaje entrante", err));
      }
    }
  }
  return NextResponse.json({ ok: true });
}
