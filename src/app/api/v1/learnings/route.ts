import { z } from "zod";
import { withAuth, withBody } from "@/lib/apiResult";
import { createLearningsAs, LEARNING_TOPICS, listLearnings } from "@/lib/learnings";

export async function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get("projectId");
  return withAuth(request, async (actor) => ({ ok: true, learnings: await listLearnings(actor, projectId ? { projectId } : {}) }));
}

const createSchema = z.object({
  projectId: z.string().nullable().optional(),
  learnings: z
    .array(
      z.object({
        topic: z.enum(LEARNING_TOPICS),
        title: z.string().min(1).max(2000),
        evidence: z.string().min(1).max(4000),
        recommendation: z.string().min(1).max(4000),
        personId: z.string().nullable().optional(),
        cutoff: z.string().max(190).nullable().optional(),
      })
    )
    .min(1)
    .max(20),
});

export async function POST(request: Request) {
  return withBody(request, createSchema, (actor, data) => createLearningsAs(actor, data.projectId ?? null, data.learnings, "claude"), 201);
}
