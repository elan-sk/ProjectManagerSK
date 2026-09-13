import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/apiAuth";
import { removeTaskTag } from "@/app/(app)/settings/tags/tagActions";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; taskTagId: string }> }) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const { taskTagId } = await params;
  const result = await removeTaskTag(taskTagId, auth.actor);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 403 });
  return NextResponse.json(result);
}
