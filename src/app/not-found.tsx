import { redirect } from "next/navigation";

// Cualquier link roto/viejo/mal tipeado (o un notFound() explícito de una
// página, ej. proyecto/tarea borrada) cae acá en vez de mostrar el 404
// genérico de Next — se manda al home, que a su vez ya sabe llevar a /agenda
// o /login según haya sesión (ver src/app/page.tsx).
export default function NotFound() {
  redirect("/");
}
