import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/apiAuth";
import { removeDependency } from "@/app/(app)/projects/[id]/tasks/[taskId]/actions";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; dependencyId: string }> }) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const { id, dependencyId } = await params;
  try {
    await removeDependency(dependencyId, id, auth.actor);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}
