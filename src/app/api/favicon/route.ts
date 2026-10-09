// Ícono (favicon) de un dominio para las fichas de links. Primero DuckDuckGo (lee el sitio en el
// momento) y, si no lo tiene, Google (usa lo que su buscador ya rastreó). Los dos responden 404 con
// un ícono genérico cuando no encuentran nada: por eso se mira el estado acá, en el servidor, y si
// ninguno lo tiene se responde 404 sin imagen para que la ficha no muestre el globo genérico.
// Pública a propósito: también la usa el link compartido con el cliente. Solo consulta esos dos
// servicios fijos con un nombre de dominio validado.
// ponytail: sin caché propia, alcanza con la del navegador (7 días); agregar una si hay muchas visitas.

const SOURCES = [
  (host: string) => `https://icons.duckduckgo.com/ip3/${host}.ico`,
  (host: string) => `https://www.google.com/s2/favicons?domain=${host}&sz=32`,
];

export async function GET(request: Request) {
  const host = (new URL(request.url).searchParams.get("host") ?? "").toLowerCase();
  if (host.length > 253 || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) return new Response(null, { status: 400 });

  for (const source of SOURCES) {
    try {
      const res = await fetch(source(host), { signal: AbortSignal.timeout(5000) });
      const type = res.headers.get("content-type") ?? "";
      if (!res.ok || !type.startsWith("image/")) continue;
      return new Response(await res.arrayBuffer(), {
        headers: { "Content-Type": type, "Cache-Control": "public, max-age=604800" },
      });
    } catch {
      // Servicio caído o lento: se prueba el siguiente.
    }
  }
  return new Response(null, { status: 404, headers: { "Cache-Control": "public, max-age=86400" } });
}
