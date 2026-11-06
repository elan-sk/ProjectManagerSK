import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getWhatsAppSettings } from "@/lib/appSettings";
import { getBotSettings, getBotUsageByUser } from "@/lib/botSettings";
import { getCloudSettingsView } from "@/lib/whatsappCloud";
import { getWhatsAppUsage } from "@/lib/whatsappUsage";
import { absoluteUrl } from "@/lib/appUrl";
import { BotSettingsForm } from "../BotSettingsForm";
import { WhatsAppConnectPanel } from "../WhatsAppConnectPanel";
import { WhatsAppConnectionSettings } from "../WhatsAppConnectionSettings";
import { AdminOnly, SettingsCard } from "../SettingsCard";

export default async function BotWhatsAppSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") return <AdminOnly />;
  const [whatsappSettings, botSettings, botUsage, whatsappCloud, whatsappUsage] = await Promise.all([getWhatsAppSettings(), getBotSettings(), getBotUsageByUser(), getCloudSettingsView(), getWhatsAppUsage()]);
  return (
    <>
      <SettingsCard title={`${botSettings.name} (bot asistente)`}>
        <p className="text-sm text-slate-500">
          Nombre, foto, tono, servicio de IA con su clave y tope mensual de preguntas — compartido por todo el equipo.
        </p>
        <BotSettingsForm
          name={botSettings.name}
          avatarUrl={botSettings.avatarUrl}
          apiKeyConfigured={botSettings.apiKeyConfigured}
          apiKeyLast4={botSettings.apiKeyLast4}
          provider={botSettings.provider}
          baseUrl={botSettings.baseUrl}
          model={botSettings.model}
          monthlyLimit={botSettings.monthlyLimit}
          usedThisPeriod={botSettings.usedThisPeriod}
          usageByUser={botUsage}
          personaPrompt={botSettings.personaPrompt}
          personaIsCustom={botSettings.personaIsCustom}
          introMessage={botSettings.introMessage}
          introMessageIsCustom={botSettings.introMessageIsCustom}
          whatsappChatEnabled={botSettings.whatsappChatEnabled}
          groupMentionsEnabled={botSettings.groupMentionsEnabled}
        />
      </SettingsCard>
      <SettingsCard title="WhatsApp (alertas)" id="whatsapp">
        <p className="text-sm text-slate-500">
          Vincula el número que va a mandar las alertas de tareas y proyectos al grupo del equipo.
        </p>
          <WhatsAppConnectionSettings
            connection={whatsappCloud.connection}
            phoneNumberId={whatsappCloud.phoneNumberId}
            accessTokenLast4={whatsappCloud.accessTokenLast4}
            appSecretLast4={whatsappCloud.appSecretLast4}
            verifyToken={whatsappCloud.verifyToken}
            templateName={whatsappCloud.templateName}
            templateLang={whatsappCloud.templateLang}
            lastError={whatsappCloud.lastError}
            webhookUrl={absoluteUrl("/api/whatsapp/cloud") ?? "/api/whatsapp/cloud"}
            used={whatsappUsage.used}
            limit={whatsappUsage.limit}
          />
          <WhatsAppConnectPanel
            connection={whatsappCloud.connection}
            showQr={whatsappCloud.connection === "qr" || Boolean(botSettings.groupMentionsEnabled)}
            currentGroupJid={whatsappSettings.groupJid}
          />
      </SettingsCard>
    </>
  );
}
