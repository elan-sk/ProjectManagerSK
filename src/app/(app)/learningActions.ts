"use server";

import { revalidatePath } from "next/cache";
import type { LearningStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { deleteLearningAs, generateLearnings, updateLearningAs } from "@/lib/learnings";

type ActionResult = { ok: true } | { ok: false; error: string };

async function viewer() {
  const session = await auth();
  if (!session?.user) throw new Error("No autenticado.");
  return session.user;
}

function done(projectId: string | null): ActionResult {
  revalidatePath("/company");
  if (projectId) revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

const PERIOD_DAYS: Record<string, number | null> = { month: 30, quarter: 90, year: 365, all: null };
const PERIOD_LABEL: Record<string, string> = { month: "último mes", quarter: "últimos 3 meses", year: "último año", all: "todo" };

export async function generateLearningsAction(projectId: string | null, period = "quarter", cutoff?: string): Promise<ActionResult & { count?: number }> {
  try {
    const days = PERIOD_DAYS[period] ?? 90;
    const r = await generateLearnings(await viewer(), {
      projectId,
      from: projectId || days === null ? null : new Date(Date.now() - days * 86_400_000),
      cutoff: cutoff ?? (projectId ? "A pedido" : `Empresa, ${PERIOD_LABEL[period] ?? "período"}`),
    });
    if (!r.ok) return { ok: false, error: r.error };
    return { ...done(projectId), count: r.count };
  } catch (err) {
    console.error("[aprendizajes] no se pudieron generar", err);
    return { ok: false, error: "No se pudieron generar los aprendizajes. Intentarlo de nuevo en un momento." };
  }
}

export async function setLearningStatusAction(id: string, status: LearningStatus): Promise<ActionResult> {
  const r = await updateLearningAs(await viewer(), id, { status });
  if (!r.ok) return { ok: false, error: r.error };
  const l = await prisma.learning.findUnique({ where: { id }, select: { projectId: true } });
  return done(l?.projectId ?? null);
}

export async function editLearningAction(id: string, patch: { title: string; evidence: string; recommendation: string }): Promise<ActionResult> {
  const r = await updateLearningAs(await viewer(), id, patch);
  if (!r.ok) return { ok: false, error: r.error };
  const l = await prisma.learning.findUnique({ where: { id }, select: { projectId: true } });
  return done(l?.projectId ?? null);
}

export async function deleteLearningAction(id: string): Promise<ActionResult> {
  const l = await prisma.learning.findUnique({ where: { id }, select: { projectId: true } });
  const r = await deleteLearningAs(await viewer(), id);
  if (!r.ok) return { ok: false, error: r.error };
  return done(l?.projectId ?? null);
}
