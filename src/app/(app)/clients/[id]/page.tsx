import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { getBotSettings } from "@/lib/botSettings";
import { getClientCard } from "../actions";
import { ClientCardView } from "../ClientCardView";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");
  const card = await getClientCard(id);
  if (!card) notFound();
  const bot = await getBotSettings();
  return <ClientCardView client={card.client} canEdit={card.canEdit} aiConfigured={card.canEdit && bot.apiKeyConfigured} />;
}
