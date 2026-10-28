import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { INTERNAL_CHAT_HEADER, isInternalChatSecret, runAsUser } from "@/lib/actorContext";
import { confirmChontatecAction, getChontatecHistory, sendChontatecMessage, type ChatUiMessage } from "@/lib/chontatec";


const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("message"), userId: z.string(), text: z.string().min(1) }),
  z.object({ action: z.literal("decision"), userId: z.string(), toolUseId: z.string(), decision: z.enum(["confirm", "decline"]) }),
]);

export async function POST(request: Request) {
  if (!isInternalChatSecret(request.headers.get(INTERNAL_CHAT_HEADER))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
  const body = parsed.data;

  const user = await prisma.user.findFirst({ where: { id: body.userId, active: true }, select: { id: true, name: true, role: true } });
  if (!user) return NextResponse.json({ error: "Usuario inactivo" }, { status: 403 });

  const before = new Set((await getChontatecHistory(user.id, "whatsapp")).map((m) => m.id));
  const history: ChatUiMessage[] = await runAsUser({ userId: user.id, role: user.role, name: user.name, channel: "whatsapp" }, () =>
    body.action === "message"
      ? sendChontatecMessage(user.id, body.text, "", "whatsapp")
      : confirmChontatecAction(user.id, body.toolUseId, body.decision, "whatsapp")
  );
  return NextResponse.json({ messages: history.filter((m) => !before.has(m.id) && m.role !== "user") });
}
