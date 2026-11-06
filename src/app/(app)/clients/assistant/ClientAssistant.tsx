"use client";

import { useCallback } from "react";
import { GuidedAssistant } from "@/components/chat/GuidedAssistant";
import { confirmClientAssistantAction, getClientAssistantState, restartClientAssistant, sendClientAssistantMessage } from "./actions";

type Props = { clientId: string | null; clientName: string | null; botName: string; botAvatarUrl: string | null };

export function ClientAssistant({ clientId, clientName, botName, botAvatarUrl }: Props) {
  const load = useCallback(() => getClientAssistantState(clientId), [clientId]);
  return (
    <GuidedAssistant
      botName={botName}
      botAvatarUrl={botAvatarUrl}
      subtitle={clientName ?? "Nuevo cliente"}
      exitHref={clientId ? `/clients/${clientId}` : "/company#clientes"}
      introTitle={clientName ? `Completar cliente: ${clientName}` : "Nuevo cliente"}
      introDocs="Subir documentos o el logo del cliente"
      restartText="¿Borrar el historial? Se borra esta conversación; la ficha del cliente no se borra."
      load={load}
      sendMessage={(t) => sendClientAssistantMessage(clientId, t)}
      confirmAction={(id, d) => confirmClientAssistantAction(clientId, id, d)}
      restart={() => restartClientAssistant(clientId)}
    />
  );
}
