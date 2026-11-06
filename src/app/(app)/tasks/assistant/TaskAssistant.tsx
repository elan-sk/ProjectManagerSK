"use client";

import { useCallback } from "react";
import { GuidedAssistant } from "@/components/chat/GuidedAssistant";
import { confirmTaskAssistantAction, getTaskAssistantState, restartTaskAssistant, sendTaskAssistantMessage } from "./actions";

type Props = { projectId: string; taskId: string | null; title: string; botName: string; botAvatarUrl: string | null; seed: string | null };

export function TaskAssistant({ projectId, taskId, title, botName, botAvatarUrl, seed }: Props) {
  const load = useCallback(() => getTaskAssistantState(projectId, taskId), [projectId, taskId]);
  return (
    <GuidedAssistant
      botName={botName}
      botAvatarUrl={botAvatarUrl}
      subtitle={title}
      exitHref={taskId ? `/projects/${projectId}/tasks/${taskId}` : `/projects/${projectId}`}
      introTitle={taskId ? "Completar la tarea" : "Nueva tarea"}
      introDocs="Subir documentos o imágenes de la tarea"
      restartText="¿Borrar el historial? Se borra esta conversación; lo que ya se creó no se borra."
      startText={seed}
      load={load}
      sendMessage={(t) => sendTaskAssistantMessage(projectId, taskId, t)}
      confirmAction={(id, d) => confirmTaskAssistantAction(projectId, taskId, id, d)}
      restart={() => restartTaskAssistant(projectId, taskId)}
    />
  );
}
