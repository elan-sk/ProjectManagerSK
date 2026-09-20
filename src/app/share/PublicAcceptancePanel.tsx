"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PublicFileGrid } from "./PublicFileGrid";
import { setPublicAcceptanceDecision } from "./shareActions";
import { useShareIdentity } from "./shareIdentity";
import { ShareIdentityBar } from "./ShareIdentityBar";
import { PublicCommentThread } from "./PublicCommentThread";
import type { PublicAcceptanceRound } from "@/lib/publicView";

const RESULT_LABEL: Record<"APPROVED" | "FAILED", string> = { APPROVED: "Aceptada", FAILED: "Devuelta" };
const RESULT_COLOR: Record<"APPROVED" | "FAILED", string> = {
  APPROVED: "bg-emerald-100 text-emerald-800",
  FAILED: "bg-red-100 text-red-800",
};

/**
 * Vista del cliente para una tarea tipo Aceptación: la ronda activa trae la
 * lista de características a aceptar/devolver una por una; se cierra sola
 * cuando quedan todas calificadas (ver setPublicAcceptanceDecision). Las
 * rondas cerradas quedan como historial de solo lectura debajo.
 */
export function PublicAcceptancePanel({ token, rounds }: { token: string; rounds: PublicAcceptanceRound[] }) {
  const activeRound = rounds.find((r) => r.outcome === null) ?? null;
  const closedRounds = rounds.filter((r) => r.outcome !== null);

  if (rounds.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-[21px] font-semibold text-slate-900">Aceptación de la entrega</h2>
        <p className="mt-1 text-[18px] text-slate-400">Todavía no se envió ninguna característica para tu aceptación.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-[21px] font-semibold text-slate-900">Aceptación de la entrega</h2>

      {activeRound && <ActiveAcceptanceRound token={token} round={activeRound} />}

      {!activeRound && closedRounds.length > 0 && (
        <RoundSummary round={closedRounds[0]} label={closedRounds[0].outcome === "APPROVED" ? "Aceptaste toda la entrega ✅" : "Devolviste esta ronda"} />
      )}

      {closedRounds.length > (activeRound ? 0 : 1) && (
        <details className="pt-1">
          <summary className="cursor-pointer text-[18px] font-semibold text-slate-600">Rondas anteriores</summary>
          <div className="mt-2 space-y-2">
            {closedRounds.slice(activeRound ? 0 : 1).map((round) => (
              <RoundSummary key={round.id} round={round} label={`Ronda ${round.roundNumber} — ${round.outcome === "APPROVED" ? "Aceptada" : "Devuelta"}`} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function RoundSummary({ round, label }: { round: PublicAcceptanceRound; label: string }) {
  return (
    <div className="space-y-2 rounded-lg border border-slate-100 p-3">
      <p className="text-[18px] font-medium text-slate-700">{label}</p>
      <ul className="space-y-1.5">
        {round.items.map((item) => (
          <li key={item.id} className="flex items-start justify-between gap-2 text-[18px]">
            <span className="text-slate-700">{item.title}</span>
            {item.result && <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${RESULT_COLOR[item.result]}`}>{RESULT_LABEL[item.result]}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ActiveAcceptanceRound({ token, round }: { token: string; round: PublicAcceptanceRound }) {
  const identity = useShareIdentity();
  const pending = round.items.filter((i) => !i.result);
  const decided = round.items.filter((i) => i.result);

  return (
    <div className="space-y-3">
      <p className="text-[18px] text-slate-600">
        Ronda {round.roundNumber}: cada característica se acepta o se devuelve. Los comentarios de una característica se cierran al calificarla.
      </p>
      {round.deliverables.length > 0 && (
        <div className="space-y-1">
          <p className="text-[18px] font-semibold text-slate-600">Entregado</p>
          <PublicFileGrid files={round.deliverables} />
        </div>
      )}

      <ShareIdentityBar />

      <ul className="space-y-5">
        {pending.map((item) => (
          <PendingItemRow key={item.id} token={token} item={item} identity={identity} number={round.items.indexOf(item) + 1} total={round.items.length} />
        ))}
        {decided.map((item) => (
          <DecidedItemRow key={item.id} token={token} item={item} number={round.items.indexOf(item) + 1} total={round.items.length} />
        ))}
      </ul>
    </div>
  );
}

function PendingItemRow({
  token,
  item,
  identity,
  number,
  total,
}: {
  token: string;
  item: PublicAcceptanceRound["items"][number];
  identity: { name: string; role: string } | null;
  number: number;
  total: number;
}) {
  const router = useRouter();
  const [returning, setReturning] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function decide(decision: "ACCEPTED" | "RETURNED") {
    if (!identity) {
      setError("Falta indicar el nombre en la parte superior antes de decidir.");
      return;
    }
    if (decision === "RETURNED" && !note.trim()) {
      setReturning(true);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await setPublicAcceptanceDecision(token, item.id, {
        decision,
        name: identity.name,
        role: identity.role || undefined,
        note: note.trim() || undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <li className="space-y-1.5 rounded-xl border border-l-4 border-slate-300 border-l-[#0a6b78] bg-white p-3 shadow-sm">
      <p className="text-[13px] font-semibold uppercase tracking-wide text-[#0a6b78]">Característica {number} de {total}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <p className="text-[19px] font-semibold text-slate-800">{item.title}</p>
        {item.category && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[13px] text-slate-500">{item.category}</span>}
      </div>
      {item.criteria && (
        <ul className="list-disc space-y-0.5 pl-4 text-[17px] text-slate-500">
          {item.criteria.split("\n").filter((l) => l.trim()).map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
      {item.evidence.length > 0 && <PublicFileGrid files={item.evidence} />}

      <PublicCommentThread token={token} reviewCheckId={item.id} contextLabel={`Característica ${number}`} identityAbove allowAttachments comments={item.comments} />

      {returning ? (
        <div className="space-y-1.5">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="¿Por qué la devolvés?"
            autoFocus
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-[17px]"
          />
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={isPending || !note.trim()}
              onClick={() => decide("RETURNED")}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-[17px] font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              Confirmar devolución
            </button>
            <button type="button" onClick={() => setReturning(false)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-[17px] text-slate-500">
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-1.5">
          <button
            type="button"
            disabled={isPending}
            onClick={() => decide("ACCEPTED")}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[17px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            ✓ Aceptar
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => setReturning(true)}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-[17px] font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            ✗ Devolver
          </button>
        </div>
      )}
      {error && <p className="text-[17px] text-red-600">{error}</p>}
    </li>
  );
}

function DecidedItemRow({ token, item, number, total }: { token: string; item: PublicAcceptanceRound["items"][number]; number: number; total: number }) {
  if (!item.result) return null;
  return (
    <li className="space-y-1 rounded-xl border border-l-4 border-slate-300 border-l-[#0a6b78] bg-white p-3 shadow-sm">
      <p className="text-[13px] font-semibold uppercase tracking-wide text-[#0a6b78]">Característica {number} de {total}</p>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[19px] font-semibold text-slate-800">{item.title}</p>
        <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${RESULT_COLOR[item.result]}`}>{RESULT_LABEL[item.result]}</span>
      </div>
      {item.note && <p className="text-[17px] text-slate-500">Nota de la devolución: {item.note}</p>}
      {item.comments.length > 0 && <PublicCommentThread token={token} reviewCheckId={item.id} contextLabel={`Característica ${number}`} identityAbove locked comments={item.comments} />}
    </li>
  );
}
