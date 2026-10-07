"use client";

import { useRouter } from "@/lib/useAppRouter";
import { CredentialView } from "../CredentialView";
import type { CredentialDetails } from "../actions";

/** Visor de la página /credentials/[id]: al editar recarga los datos; al eliminar vuelve al proyecto. */
export function CredentialPageView({ credential }: { credential: CredentialDetails }) {
  const router = useRouter();
  return (
    <CredentialView
      credential={credential}
      onChanged={() => router.refresh()}
      onDeleted={() => router.push(`/projects/${credential.projectId}?view=files`)}
    />
  );
}
