import { withAuth, withBody } from "@/lib/apiResult";
import { clientBodySchema, clientDetailFor, deleteClientAs, saveClientAs } from "@/lib/clients";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(request, (actor) => clientDetailFor(actor, id));
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withBody(request, clientBodySchema, (actor, data) => saveClientAs(actor, id, data));
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(request, (actor) => deleteClientAs(actor, id));
}
