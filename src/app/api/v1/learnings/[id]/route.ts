import { z } from "zod";
import { withAuth, withBody } from "@/lib/apiResult";
import { deleteLearningAs, LEARNING_TOPICS, updateLearningAs } from "@/lib/learnings";

const patchSchema = z.object({
  status: z.enum(["PROPOSED", "APPLIED", "DISCARDED"]).optional(),
  topic: z.enum(LEARNING_TOPICS).optional(),
  title: z.string().min(1).max(2000).optional(),
  evidence: z.string().min(1).max(4000).optional(),
  recommendation: z.string().min(1).max(4000).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withBody(request, patchSchema, (actor, data) => updateLearningAs(actor, id, data));
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(request, (actor) => deleteLearningAs(actor, id));
}
