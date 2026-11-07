import { Fragment } from "react";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { ProjectIcon } from "@/components/ProjectIcon";
import { ALERT_STYLE, ALERT_LEVEL_LABEL } from "@/components/AlertBadge";
import { TASK_STATUS_COLOR, TASK_STATUS_LABEL, PROJECT_PHASE_LABEL } from "@/lib/statusColors";
import type { TaskStatus } from "@prisma/client";
import type { TaskAlert } from "@/lib/delays";
import { isFileHref, type ViewFile } from "@/components/FileViewer";
import { SparklesIcon } from "@/components/icons";

// Markdown mínimo que puede mandar el bot: **negrita**, [texto](url), y
// miniaturas propias de la interfaz [[tipo:datos]] (persona/proyecto/estado/
// alerta, ver buildOperatingRules en chontatec.ts) — nada de librerías,
// alcanza con un split por regex. Los saltos de línea del texto se
// resuelven aparte con whitespace-pre-wrap.
// A veces el modelo arma la marca sin tipo ([[Nombre|/projects/…]] o [[Nombre|projectId|iconUrl]]):
// se traduce a link o miniatura de proyecto para no mostrarle rutas ni ids a la persona.
function fixMalformedMarkers(text: string): string {
  return text.replace(/\[\[(?![a-z]+:)([^\]|]+)\|([^\]]*)\]\]/g, (_m, name: string, rawArgs: string) => {
    const args = rawArgs.split("|");
    const path = args.find((a) => a.startsWith("/projects/") || a.startsWith("http"));
    if (path) return `[${name.trim()}](${path})`;
    if (/^c[a-z0-9]{20,}$/.test(args[0])) return `[[project:${name.trim()}|${rawArgs}]]`;
    return name.trim();
  });
}

const INLINE_MARKDOWN = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|\[\[[a-z]+:[^\]]*\]\])/g;

function renderInlineMarkdown(text: string, openFile: (f: ViewFile) => void) {
  return text.split(INLINE_MARKDOWN).map((part, i) => {
    const bold = part.match(/^\*\*([^*]+)\*\*$/);
    if (bold) return <strong key={i}>{renderInlineMarkdown(bold[1], openFile)}</strong>;

    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    // Link a un archivo (subido a la app o con extensión conocida): se abre en su visor, no se descarga.
    if (link && isFileHref(link[2])) {
      return (
        <button key={i} type="button" onClick={() => openFile({ url: link[2], name: link[1] })} className="cursor-pointer underline decoration-dotted underline-offset-2 hover:text-slate-950">
          {link[1]}
        </button>
      );
    }
    // Link a un asistente guiado (proyectos, tareas, clientes, empresa): botón con el ícono de los asistentes.
    if (link && /\/assistant(\?|$)/.test(link[2])) {
      return (
        <Link key={i} href={link[2]} className="my-1 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white no-underline shadow-sm hover:bg-blue-700">
          <SparklesIcon className="h-4 w-4" />
          {link[1]}
        </Link>
      );
    }
    if (link) {
      return (
        <Link key={i} href={link[2]} className="underline decoration-dotted underline-offset-2 hover:text-slate-950">
          {link[1]}
        </Link>
      );
    }

    const chip = part.match(/^\[\[([a-z]+):([^\]]*)\]\]$/);
    if (chip) {
      const [, type, rawArgs] = chip;
      const args = rawArgs.split("|");
      const rendered = renderChip(i, type, args);
      if (rendered) return rendered;
    }

    return <Fragment key={i}>{part}</Fragment>;
  });
}

const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_SEPARATOR = /^\s*\|?(\s*:?-{3,}:?\s*\|)+\s*:?-{0,}:?\s*\|?\s*$/;

function tableCells(line: string) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

export function renderMessage(text: string, openFile: (f: ViewFile) => void) {
  const lines = fixMalformedMarkers(text).split("\n");
  const blocks: ({ kind: "text"; lines: string[] } | { kind: "table"; header: string[]; rows: string[][] })[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (TABLE_ROW.test(lines[i]) && TABLE_SEPARATOR.test(lines[i + 1] ?? "")) {
      const header = tableCells(lines[i]);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && TABLE_ROW.test(lines[i])) rows.push(tableCells(lines[i++]));
      i--;
      blocks.push({ kind: "table", header, rows });
      continue;
    }
    const last = blocks[blocks.length - 1];
    if (last?.kind === "text") last.lines.push(lines[i]);
    else blocks.push({ kind: "text", lines: [lines[i]] });
  }
  return blocks.map((b, i) => {
    if (b.kind === "text") {
      const body = b.lines.join("\n").replace(/^\n+|\n+$/g, "");
      return body ? (
        <span key={i} className="block whitespace-pre-wrap">
          {renderInlineMarkdown(body, openFile)}
        </span>
      ) : null;
    }
    return (
      <div key={i} className="my-1.5 overflow-x-auto">
        <table className="w-full border-collapse text-xs leading-snug">
          <thead>
            <tr>
              {b.header.map((h, j) => (
                <th key={j} className="border-b border-slate-300 px-1.5 py-1 text-left align-bottom font-semibold">
                  {renderInlineMarkdown(h, openFile)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {b.rows.map((r, j) => (
              <tr key={j}>
                {b.header.map((_, k) => (
                  <td key={k} className="border-b border-slate-200 px-1.5 py-1 align-top">
                    {renderInlineMarkdown(r[k] ?? "", openFile)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  });
}

const PROJECT_PHASE_STATUS: Record<keyof typeof PROJECT_PHASE_LABEL, TaskStatus> = {
  PLANNING: "NOT_STARTED",
  ACTIVE: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
};

function renderChip(key: number, type: string, args: string[]) {
  if (type === "person") {
    const [name, avatarUrl] = args;
    if (!name) return null;
    return (
      <span key={key} className="inline-flex items-center gap-1 align-middle">
        <Avatar name={name} avatarUrl={avatarUrl || null} size="h-4 w-4 text-[7px]" />
        {name}
      </span>
    );
  }

  if (type === "project") {
    const [name, projectId, iconUrl, parentName, parentIconUrl] = args;
    if (!name) return null;
    const chipBody = (
      <span className="inline-flex items-center gap-1 align-middle">
        <ProjectIcon name={name} iconUrl={iconUrl || null} parent={parentName ? { name: parentName, iconUrl: parentIconUrl || null } : null} inline size="h-4 w-4 text-[7px]" />
        {name}
      </span>
    );
    return projectId ? (
      <Link key={key} href={`/projects/${projectId}`} className="hover:underline">
        {chipBody}
      </Link>
    ) : (
      <Fragment key={key}>{chipBody}</Fragment>
    );
  }

  if (type === "status") {
    const phase = args[0] as keyof typeof PROJECT_PHASE_LABEL;
    const code = (PROJECT_PHASE_STATUS[phase] && !(args[0] in TASK_STATUS_LABEL) ? PROJECT_PHASE_STATUS[phase] : args[0]) as TaskStatus;
    const color = TASK_STATUS_COLOR[code];
    const label = args[0] in TASK_STATUS_LABEL ? TASK_STATUS_LABEL[code] : PROJECT_PHASE_LABEL[phase];
    if (!color || !label) return null;
    return (
      <span key={key} className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium ${color.badge}`}>
        {label}
      </span>
    );
  }

  if (type === "alert") {
    const level = args[0] as TaskAlert["level"];
    const style = ALERT_STYLE[level];
    const label = ALERT_LEVEL_LABEL[level];
    if (!style || !label) return null;
    return (
      <span key={key} className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium ${style}`}>
        {label}
      </span>
    );
  }

  return null;
}

// Lo que no se debe leer en voz alta: marcado de negrita/links/miniaturas de
// Markdown — de persona/proyecto solo interesa el nombre; de estado/alerta,
// la etiqueta en español (no el código crudo en inglés).
export function stripMarkdownForSpeech(text: string): string {
  return fixMalformedMarkers(text)
    .replace(/\[\[([a-z]+):([^\]]*)\]\]/g, (_match, type: string, rawArgs: string) => {
      const [first] = rawArgs.split("|");
      if (type === "status") return TASK_STATUS_LABEL[first as TaskStatus] ?? PROJECT_PHASE_LABEL[first as keyof typeof PROJECT_PHASE_LABEL] ?? first;
      if (type === "alert") return ALERT_LEVEL_LABEL[first as TaskAlert["level"]] ?? first;
      return first ?? "";
    })
    .replace(/^\s*\|?(\s*:?-{3,}:?\s*\|?)+\s*$/gm, "")
    .replace(/^\s*\|(.*)\|\s*$/gm, (_m, row: string) => row.split("|").map((c) => c.trim()).join(", ") + ".")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/[*_#`]/g, "");
}
