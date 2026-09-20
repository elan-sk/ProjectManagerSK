import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// Nombre de un enlace cuando quien lo agrega no escribe uno: se toma el título
// de la página (og:title o <title>). Devuelve null si no se puede obtener, y
// quien llama conserva su comportamiento normal (pedir el nombre).

const MAX_BYTES = 200_000;
const MAX_REDIRECTS = 3;

// Bloquea destinos internos (localhost, redes privadas, metadatos cloud): la
// acción pública de /share lo llama sin sesión, así que sin esto sería un SSRF.
function isPrivateIp(ip: string) {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:");
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

async function isSafeUrl(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  try {
    const addrs = await lookup(url.hostname, { all: true });
    return addrs.length > 0 && addrs.every((a) => !isPrivateIp(a.address));
  } catch {
    return false;
  }
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function decodeEntities(s: string) {
  return s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function extractTitle(html: string) {
  const head = html.slice(0, MAX_BYTES);
  const og = head.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ?? head.match(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
  const raw = og?.[1] ?? head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const title = raw ? decodeEntities(raw).replace(/\s+/g, " ").trim() : "";
  return title ? title.slice(0, 120) : null;
}

export async function fetchPageTitle(rawUrl: string): Promise<string | null> {
  try {
    let url = new URL(rawUrl);
    for (let i = 0; i <= MAX_REDIRECTS; i++) {
      if (!(await isSafeUrl(url))) return null;
      const res = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(4000),
        headers: { "user-agent": "Mozilla/5.0 (compatible; ProjectManagerSK/1.0)", accept: "text/html" },
      });
      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        url = new URL(location, url);
        continue;
      }
      if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html") || !res.body) return null;
      // Lee solo el inicio: el título vive en el <head>.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let html = "";
      while (html.length < MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        html += decoder.decode(value, { stream: true });
        if (/<\/head>/i.test(html)) break;
      }
      reader.cancel().catch(() => {});
      return extractTitle(html);
    }
  } catch {
    // sin red, timeout o URL inválida: se trata como "no se pudo obtener"
  }
  return null;
}
