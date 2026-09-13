import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/apiAuth";
import { removeProjectAttachment } from "@/app/(app)/projects/[id]/definitionActions";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; attachmentId: string }> }) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const { attachmentId } = await params;
  const result = await removeProjectAttachment(attachmentId, auth.actor);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 403 });
  return NextResponse.json(result);
}
