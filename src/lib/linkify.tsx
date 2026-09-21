import type { ReactNode } from "react";

// Texto plano o HTML con URLs sueltas → enlaces clicables. Sin "use client":
// se usa igual desde Server y Client Components.
const URL_RE = /https?:\/\/(?:(?!&(?:lt|gt|quot);)[^\s<>"'])+/g;
const TRAILING = /[.,;:!?)\]}]+$/;

function splitTrailing(raw: string) {
  const tail = raw.match(TRAILING)?.[0] ?? "";
  return { url: raw.slice(0, raw.length - tail.length), tail };
}

const LINK_CLASS = "text-[#0a6b78] underline underline-offset-2 hover:text-[#085560] break-all";

/** Texto plano → nodos con las URLs como enlaces (abren en pestaña nueva). */
export function Linkify({ text }: { text: string }): ReactNode {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const { url, tail } = splitTrailing(m[0]);
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      <a key={m.index} href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className={LINK_CLASS}>
        {url}
      </a>
    );
    if (tail) out.push(tail);
    last = m.index + m[0].length;
  }
  if (last === 0) return text;
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

/** HTML (descripciones del editor) → mismo HTML con las URLs sueltas envueltas en <a>. */
export function linkifyHtml(html: string): string {
  let inAnchor = 0;
  return html
    .split(/(<[^>]*>)/)
    .map((seg) => {
      if (seg.startsWith("<")) {
        if (/^<a[\s>]/i.test(seg)) inAnchor++;
        else if (/^<\/a\s*>/i.test(seg)) inAnchor = Math.max(0, inAnchor - 1);
        return seg;
      }
      if (inAnchor) return seg;
      return seg.replace(URL_RE, (raw) => {
        const { url, tail } = splitTrailing(raw);
        return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>${tail}`;
      });
    })
    .join("");
}
