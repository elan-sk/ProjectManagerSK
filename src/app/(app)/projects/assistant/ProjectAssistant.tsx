"use client";

import { useCallback } from "react";
import { GuidedAssistant } from "@/components/chat/GuidedAssistant";
import { confirmProjectAssistantAction, getProjectAssistantState, restartProjectAssistant, sendProjectAssistantMessage } from "./actions";

export function ProjectAssistant({ projectId, botName, botAvatarUrl, seed }: { projectId: string | null; botName: string; botAvatarUrl: string | null; seed?: string | null }) {
  const load = useCallback(() => getProjectAssistantState(projectId), [projectId]);
  return (
    <GuidedAssistant
      botName={botName}
      botAvatarUrl={botAvatarUrl}
      subtitle={projectId ? "Completar proyecto" : "Nuevo proyecto"}
      exitHref={projectId ? `/projects/${projectId}` : "/projects"}
      introTitle={projectId ? "Completar el proyecto" : "Nuevo proyecto"}
      introDocs="Subir documentos (propuesta, cotización, brief)"
      restartText="¿Borrar el historial? Se borra esta conversación; lo que ya se creó en el proyecto no se borra."
      startText={seed}
      load={load}
      sendMessage={(t) => sendProjectAssistantMessage(projectId, t)}
      confirmAction={(id, d) => confirmProjectAssistantAction(projectId, id, d)}
      restart={() => restartProjectAssistant(projectId)}
    />
  );
}
