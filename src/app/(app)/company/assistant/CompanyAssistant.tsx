"use client";

import type { ChatUiMessage } from "@/components/chat/ChatMessages";
import { GuidedAssistant, type GuidedSteps } from "@/components/chat/GuidedAssistant";
import { confirmCompanyAssistantAction, getCompanyAssistantState, restartCompanyAssistant, sendCompanyAssistantMessage, type CompanyProfileUi } from "../actions";

function toSteps(profile: CompanyProfileUi): GuidedSteps {
  return { items: profile.items.map((i) => ({ key: i.key, label: i.label, done: Boolean(i.text), current: i.state === "current" })), covered: profile.covered, total: profile.total };
}

const toResult = (r: { messages: ChatUiMessage[]; profile: CompanyProfileUi }) => ({ messages: r.messages, steps: toSteps(r.profile) });
const load = async () => {
  const s = await getCompanyAssistantState();
  return { ...toResult(s), aiConfigured: s.aiConfigured };
};

export function CompanyAssistant({ botName, botAvatarUrl }: { botName: string; botAvatarUrl: string | null }) {
  return (
    <GuidedAssistant
      botName={botName}
      botAvatarUrl={botAvatarUrl}
      subtitle="Empresa"
      exitHref="/company"
      introTitle="Perfil de la empresa"
      introText="Unas preguntas cortas sobre la empresa, cómo trabaja y qué se quiere lograr con la aplicación. Con eso, los consejos y conclusiones de la IA se ajustan a ella."
      introDocs="Subir documentos (brochure, portafolio)"
      restartText="¿Borrar el historial? Se borra esta conversación; el perfil de la empresa no se borra."
      load={load}
      sendMessage={async (t) => toResult(await sendCompanyAssistantMessage(t))}
      confirmAction={async (id, d) => toResult(await confirmCompanyAssistantAction(id, d))}
      restart={async () => toResult(await restartCompanyAssistant())}
    />
  );
}
