import { withAuth, withBody } from "@/lib/apiResult";
import { clientBodySchema, listClientsFor, saveClientAs } from "@/lib/clients";


export async function GET(request: Request) {
  return withAuth(request, async (actor) => ({ ok: true, clients: await listClientsFor(actor) }));
}

export async function POST(request: Request) {
  return withBody(request, clientBodySchema, (actor, data) => saveClientAs(actor, null, data), 201);
}
