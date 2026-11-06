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

type Fetched = { ok: true; html: string; url: string } | { ok: false; reason: "blocked" | "unreachable" | "not_html" };

async function fetchHtml(rawUrl: string, maxBytes: number, timeoutMs: number, untilHead: boolean): Promise<Fetched> {
  try {
    let url = new URL(rawUrl);
    for (let i = 0; i <= MAX_REDIRECTS; i++) {
      if (!(await isSafeUrl(url))) return { ok: false, reason: "blocked" };
      const res = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { "user-agent": "Mozilla/5.0 (compatible; ProjectManagerSK/1.0)", accept: "text/html" },
      });
      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        url = new URL(location, url);
        continue;
      }
      if (!res.ok || !res.body) return { ok: false, reason: "unreachable" };
      if (!(res.headers.get("content-type") ?? "").includes("html")) return { ok: false, reason: "not_html" };
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let html = "";
      while (html.length < maxBytes) {
        const { done, value } = await reader.read();
        if (done) break;
        html += decoder.decode(value, { stream: true });
        if (untilHead && /<\/head>/i.test(html)) break;
      }
      reader.cancel().catch(() => {});
      return { ok: true, html, url: url.toString() };
    }
  } catch {
    return { ok: false, reason: "unreachable" };
  }
  return { ok: false, reason: "unreachable" };
}

export async function fetchPageTitle(rawUrl: string): Promise<string | null> {
  const page = await fetchHtml(rawUrl, MAX_BYTES, 4000, true);
  return page.ok ? extractTitle(page.html) : null;
}

const TEXT_MAX_BYTES = 2_000_000;
const TEXT_MAX_CHARS = 20_000;

export function htmlToText(html: string): string {
  const body = html
    .replace(/<(script|style|noscript|svg|template)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(body)
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

export async function fetchPageText(rawUrl: string): Promise<{ ok: true; url: string; title: string | null; text: string } | { ok: false; error: string }> {
  let url: string;
  try {
    url = new URL(/^https?:\/\//i.test(rawUrl.trim()) ? rawUrl.trim() : `https://${rawUrl.trim()}`).toString();
  } catch {
    return { ok: false, error: "La dirección no es válida." };
  }
  const page = await fetchHtml(url, TEXT_MAX_BYTES, 10_000, false);
  if (!page.ok) {
    return {
      ok: false,
      error: page.reason === "blocked" ? "Esa dirección no se puede leer." : page.reason === "not_html" ? "Esa dirección no es una página web." : "No se pudo abrir la página (puede pedir iniciar sesión o estar caída).",
    };
  }
  const text = htmlToText(page.html);
  if (text.length < 80) return { ok: false, error: "La página no muestra texto sin iniciar sesión o sin abrirla en un navegador." };
  return { ok: true, url: page.url, title: extractTitle(page.html), text: text.slice(0, TEXT_MAX_CHARS) };
}
