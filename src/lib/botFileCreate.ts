import { marked, type Token } from "marked";

export type BuiltFile = { ok: true; name: string; buffer: Buffer } | { ok: false; error: string };

type Run = { text: string; bold?: boolean };
type Block =
  | { kind: "heading"; level: number; runs: Run[] }
  | { kind: "paragraph"; runs: Run[] }
  | { kind: "list"; items: { runs: Run[]; level: number; marker: string }[] }
  | { kind: "table"; rows: string[][] };
export type DocImage = { data: Buffer; width: number; height: number };
export type DocTheme = { ink: string; muted: string; line: string; heading: string; headerFill: string; headerText: string; logo?: DocImage; icon?: DocImage; footer: string[] };
type Doc = { title: string; date: string; blocks: Block[]; theme: DocTheme };

const FORMATS_TEXT = "Word (.docx), Excel (.xlsx), PDF (.pdf), PowerPoint (.pptx), Markdown (.md), texto (.txt), CSV (.csv) y HTML (.html)";
const RAW_EXTENSIONS = new Set([".md", ".txt", ".csv", ".html"]);
const BUILDERS: Record<string, (doc: Doc) => Promise<Buffer>> = { ".docx": buildDocx, ".pdf": buildPdf, ".xlsx": buildXlsx, ".pptx": buildPptx };

export const DEFAULT_THEME: DocTheme = { ink: "0F172A", muted: "64748B", line: "CBD5E1", heading: "0F172A", headerFill: "E2E8F0", headerText: "0F172A", footer: [] };

function fit(img: DocImage, maxW: number, maxH: number) {
  const scale = Math.min(maxW / img.width, maxH / img.height, 1);
  return { w: Math.round(img.width * scale), h: Math.round(img.height * scale) };
}

export async function buildFile(fileName: string, content: string, theme: DocTheme | null = null): Promise<BuiltFile> {
  const match = /^(.*)(\.[A-Za-z0-9]+)$/.exec(fileName.trim());
  const ext = match?.[2].toLowerCase().replace(/^\.htm$/, ".html") ?? "";
  if (!RAW_EXTENSIONS.has(ext) && !BUILDERS[ext]) return { ok: false, error: `Formato no admitido. Se pueden crear: ${FORMATS_TEXT}.` };
  if (!content.trim()) return { ok: false, error: "Falta el contenido del archivo." };

  const base = match![1].replace(/[^\p{L}\p{N} ._()-]+/gu, " ").replace(/\s+/g, " ").replace(/^[ .]+|[ .]+$/g, "").slice(0, 80) || "archivo";
  const name = `${base}${ext}`;
  if (RAW_EXTENSIONS.has(ext)) return { ok: true, name, buffer: Buffer.from(ext === ".csv" ? `﻿${content}` : content, "utf8") };

  const blocks = toBlocks(marked.lexer(content));
  const first = blocks.findIndex((b) => b.kind === "heading" && b.level === 1);
  const title = first >= 0 ? plain((blocks.splice(first, 1)[0] as { runs: Run[] }).runs) : base;
  const date = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", dateStyle: "long" }).format(new Date());
  return { ok: true, name, buffer: await BUILDERS[ext]({ title, date, blocks, theme: theme ?? DEFAULT_THEME }) };
}

const plain = (runs: Run[]) => runs.map((r) => r.text).join("");

function inline(tokens: Token[] | undefined, bold = false): Run[] {
  return (tokens ?? []).flatMap((t): Run[] => {
    if (t.type === "strong") return inline(t.tokens, true);
    if (t.type === "br") return [{ text: " ", bold }];
    if (t.type === "list") return [];
    if ("tokens" in t && t.tokens?.length) return inline(t.tokens, bold);
    return [{ text: "text" in t ? String(t.text) : t.raw, bold }];
  });
}

function toBlocks(tokens: Token[]): Block[] {
  return tokens.flatMap((t): Block[] => {
    if (t.type === "heading") return [{ kind: "heading", level: t.depth, runs: inline(t.tokens) }];
    if (t.type === "paragraph" || t.type === "text") return [{ kind: "paragraph", runs: inline("tokens" in t && t.tokens ? t.tokens : [t]) }];
    if (t.type === "code") return [{ kind: "paragraph", runs: [{ text: t.text }] }];
    if (t.type === "blockquote") return toBlocks(t.tokens ?? []);
    if (t.type === "list") return [{ kind: "list", items: listItems(t, 0) }];
    if (t.type === "table") {
      const cells = (row: { tokens: Token[] }[]) => row.map((c) => plain(inline(c.tokens)));
      return [{ kind: "table", rows: [cells(t.header), ...t.rows.map(cells)] }];
    }
    return [];
  });
}

function listItems(list: Token, level: number): { runs: Run[]; level: number; marker: string }[] {
  if (list.type !== "list") return [];
  return list.items.flatMap((item: { tokens: Token[] }, i: number) => [
    { runs: inline(item.tokens), level, marker: list.ordered ? `${Number(list.start || 1) + i}.` : "•" },
    ...item.tokens.filter((t) => t.type === "list").flatMap((nested) => listItems(nested, level + 1)),
  ]);
}

const padded = (rows: string[][]) => {
  const width = Math.max(...rows.map((r) => r.length));
  return rows.map((r) => [...r, ...Array(width - r.length).fill("")]);
};

async function buildDocx({ title, date, blocks, theme }: Doc) {
  const { AlignmentType, Document, Footer, Header, HeadingLevel, ImageRun, Packer, PageNumber, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType } = await import("docx");
  const CONTENT_WIDTH = 9026;
  const runs = (list: Run[]) => list.map((r) => new TextRun({ text: r.text, bold: r.bold }));
  const headings = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3];

  const children = blocks.flatMap((b) => {
    if (b.kind === "heading") return [new Paragraph({ heading: headings[Math.min(b.level, 3) - 1], children: b.runs.map((r) => new TextRun({ text: r.text, bold: true, color: theme.heading })), spacing: { before: 240, after: 120 } })];
    if (b.kind === "paragraph") return [new Paragraph({ children: runs(b.runs), spacing: { after: 160 } })];
    if (b.kind === "list")
      return b.items.map((item) =>
        item.marker === "•"
          ? new Paragraph({ children: runs(item.runs), bullet: { level: item.level } })
          : new Paragraph({ children: [new TextRun(`${item.marker} `), ...runs(item.runs)], indent: { left: 360 * (item.level + 1) } })
      );
    const rows = padded(b.rows);
    const columnWidth = Math.floor(CONTENT_WIDTH / rows[0].length);
    return [
      new Table({
        width: { size: CONTENT_WIDTH, type: WidthType.DXA },
        columnWidths: rows[0].map(() => columnWidth),
        rows: rows.map(
          (row, i) =>
            new TableRow({
              tableHeader: i === 0,
              children: row.map(
                (cell) =>
                  new TableCell({
                    width: { size: columnWidth, type: WidthType.DXA },
                    margins: { top: 60, bottom: 60, left: 100, right: 100 },
                    shading: i === 0 ? { type: ShadingType.CLEAR, fill: theme.headerFill, color: "auto" } : undefined,
                    borders: { top: { style: "single", size: 4, color: theme.line }, bottom: { style: "single", size: 4, color: theme.line }, left: { style: "single", size: 4, color: theme.line }, right: { style: "single", size: 4, color: theme.line } },
                    children: [new Paragraph({ children: [new TextRun({ text: cell, bold: i === 0, color: i === 0 ? theme.headerText : undefined })] })],
                  })
              ),
            })
        ),
      }),
      new Paragraph({ children: [] }),
    ];
  });

  const doc = new Document({
    title,
    styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
    sections: [
      {
        headers: theme.logo
          ? { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new ImageRun({ type: "png", data: theme.logo.data, transformation: (() => { const d = fit(theme.logo!, 160, 48); return { width: d.w, height: d.h }; })() })] })] }) }
          : undefined,
        footers: {
          default: new Footer({
            children: [
              ...theme.footer.map((line) => new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: line, color: theme.muted, size: 16 })] })),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: ["Página ", PageNumber.CURRENT], color: theme.muted, size: 18 })] }),
            ],
          }),
        },
        children: [
          new Paragraph({ children: [new TextRun({ text: title, bold: true, size: 40, color: theme.heading })] }),
          new Paragraph({ children: [new TextRun({ text: date, color: theme.muted, size: 20 })], spacing: { after: 320 }, border: { bottom: { style: "single", size: 6, color: theme.line, space: 8 } } }),
          ...children,
        ],
      },
    ],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}

async function buildPdf({ title, date, blocks, theme }: Doc) {
  const PDFDocument = (await import("pdfkit")).default;
  const doc = new PDFDocument({ size: "A4", margins: { top: 56, left: 56, right: 56, bottom: 56 + 11 * theme.footer.length }, bufferPages: true, info: { Title: title } });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const clean = (text: string) => text.replace(/[^\t\n\x20-\x7E\xA0-\xFF–—‘’“”•…€]/g, "").replace(/ {2,}/g, " ");
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const write = (runs: Run[], size: number, x = left, forceBold = false, color = theme.ink) => {
    const parts = runs.map((r) => ({ ...r, text: clean(r.text) })).filter((r) => r.text);
    if (parts.length === 0) return;
    doc.fontSize(size).fillColor(`#${color}`);
    doc.x = x;
    parts.forEach((r, i) => doc.font(forceBold || r.bold ? "Helvetica-Bold" : "Helvetica").text(r.text, { continued: i < parts.length - 1, width: width - (x - left) }));
    doc.x = left;
  };

  if (theme.logo) {
    const d = fit(theme.logo, 140, 44);
    doc.image(theme.logo.data, left + width - d.w, doc.y, { width: d.w, height: d.h });
    doc.y += d.h + 12;
  }
  write([{ text: title }], 20, left, true, theme.heading);
  doc.font("Helvetica").fontSize(10).fillColor(`#${theme.muted}`).text(clean(date));
  doc.moveDown(0.5).moveTo(left, doc.y).lineTo(left + width, doc.y).strokeColor(`#${theme.line}`).stroke().moveDown(1);

  for (const b of blocks) {
    if (b.kind === "heading") {
      doc.moveDown(0.4);
      write(b.runs, [15, 13, 12][Math.min(b.level, 3) - 1], left, true, theme.heading);
      doc.moveDown(0.3);
    } else if (b.kind === "paragraph") {
      write(b.runs, 11);
      doc.moveDown(0.6);
    } else if (b.kind === "list") {
      for (const item of b.items) write([{ text: `${item.marker} ` }, ...item.runs], 11, left + 14 * (item.level + 1));
      doc.moveDown(0.6);
    } else {
      doc.font("Helvetica").fontSize(10).fillColor(`#${theme.ink}`);
      doc.table({
        defaultStyle: { border: 0.5, borderColor: `#${theme.line}`, padding: 5 },
        data: padded(b.rows).map((row, i) => row.map((cell) => ({ text: clean(cell), ...(i === 0 && { backgroundColor: `#${theme.headerFill}`, textColor: `#${theme.headerText}`, font: { src: "Helvetica-Bold" } }) }))),
      });
      doc.x = left;
      doc.moveDown(1);
    }
  }

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0;
    theme.footer.forEach((line, n) => doc.font("Helvetica").fontSize(8).fillColor(`#${theme.muted}`).text(clean(line), left, doc.page.height - 36 - 11 * (theme.footer.length - n), { width, align: "center", lineBreak: false }));
    doc.font("Helvetica").fontSize(9).fillColor(`#${theme.muted}`).text(`Página ${i + 1} de ${range.count}`, left, doc.page.height - 30, { width, align: "center", lineBreak: false });
  }
  doc.end();
  return finished;
}

function cellValue(text: string): string | number {
  const value = text.trim();
  return /^-?(0|[1-9]\d{0,14})([.,]\d{1,2})?$/.test(value) ? Number(value.replace(",", ".")) : value;
}

async function buildXlsx({ title, blocks, theme }: Doc) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  let sheet: import("exceljs").Worksheet | null = null;
  let pendingName: string | null = null;
  const sheetFor = () => {
    if (sheet && !pendingName) return sheet;
    const wanted = (pendingName ?? title).replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 28) || "Hoja";
    let name = wanted;
    for (let n = 2; workbook.getWorksheet(name); n++) name = `${wanted} ${n}`;
    pendingName = null;
    sheet = workbook.addWorksheet(name);
    return sheet;
  };

  for (const b of blocks) {
    if (b.kind === "heading") pendingName = plain(b.runs);
    else if (b.kind === "paragraph") sheetFor().addRow([plain(b.runs)]);
    else if (b.kind === "list") for (const item of b.items) sheetFor().addRow([`${item.marker} ${plain(item.runs)}`]);
    else {
      const ws = sheetFor();
      if (ws.rowCount > 0) ws.addRow([]);
      padded(b.rows).forEach((row, i) => {
        const added = ws.addRow(i === 0 ? row : row.map(cellValue));
        if (i > 0) return;
        added.font = { bold: true, color: { argb: `FF${theme.headerText}` } };
        added.eachCell((cell) => (cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${theme.headerFill}` } }));
      });
    }
  }
  if (workbook.worksheets.length === 0) sheetFor();
  for (const ws of workbook.worksheets) {
    if (theme.footer.length > 0) ws.headerFooter.oddFooter = `&C&8${theme.footer.join(" · ").replace(/&/g, "&&")}`;
    ws.columns.forEach((column) => {
      let longest = 8;
      column.eachCell?.({ includeEmpty: false }, (cell) => (longest = Math.max(longest, String(cell.value ?? "").length)));
      column.width = Math.min(longest + 2, 60);
    });
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function buildPptx({ title, date, blocks, theme }: Doc) {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_WIDE";
  pres.title = title;
  const X = 0.6;
  const W = 12.1;

  const cover = pres.addSlide();
  const image = (img: DocImage, maxW: number, maxH: number) => {
    const d = fit(img, maxW * 100, maxH * 100);
    return { data: `image/png;base64,${img.data.toString("base64")}`, w: d.w / 100, h: d.h / 100 };
  };
  if (theme.logo) cover.addImage({ ...image(theme.logo, 3, 1.1), x: X, y: 0.6 });
  cover.addShape("rect", { x: X, y: 4.0 - 0.15, w: 1.2, h: 0.06, fill: { color: theme.line }, line: { color: theme.line } });
  cover.addText(title, { x: X, y: 2.1, w: W, h: 1.6, fontSize: 36, bold: true, color: theme.heading, valign: "bottom" });
  cover.addText(date, { x: X, y: 4.0, w: W, h: 0.5, fontSize: 16, color: theme.muted });
  if (theme.footer.length > 0) cover.addText(theme.footer.join("\n"), { x: X, y: 6.5, w: W, h: 0.7, fontSize: 10, color: theme.muted, valign: "bottom" });

  type SlideData = { title: string; lines: { text: string; bullet: boolean; level: number }[]; table?: string[][] };
  const slides: SlideData[] = [];
  const current = (heading = title) => {
    const last = slides.at(-1);
    if (last && !last.table) return last;
    slides.push({ title: last?.title ?? heading, lines: [] });
    return slides.at(-1)!;
  };
  for (const b of blocks) {
    if (b.kind === "heading") slides.push({ title: plain(b.runs), lines: [] });
    else if (b.kind === "paragraph") current().lines.push({ text: plain(b.runs), bullet: false, level: 0 });
    else if (b.kind === "list") current().lines.push(...b.items.map((item) => ({ text: plain(item.runs), bullet: true, level: item.level })));
    else current().table = padded(b.rows);
  }

  for (const data of slides) {
    const slide = pres.addSlide();
    slide.slideNumber = { x: 12.2, y: 6.95, fontSize: 10, color: theme.muted };
    if (theme.icon) {
      const img = image(theme.icon, 1.1, 0.55);
      slide.addImage({ ...img, x: 12.7 - img.w, y: 0.4 });
    }
    slide.addText(data.title, { x: X, y: 0.35, w: theme.icon ? W - 1.3 : W, h: 0.8, fontSize: 26, bold: true, color: theme.heading });
    slide.addShape("rect", { x: X, y: 1.12, w: 1.2, h: 0.05, fill: { color: theme.line }, line: { color: theme.line } });
    const textHeight = data.table ? Math.min(0.45 * data.lines.length + 0.2, 2.4) : 5.4;
    if (data.lines.length > 0) {
      slide.addText(
        data.lines.map((line) => ({ text: line.text, options: { bullet: line.bullet ? { indent: 18 } : false, indentLevel: line.level, breakLine: true } })),
        { x: X, y: 1.3, w: W, h: textHeight, fontSize: data.table ? 14 : 18, color: theme.ink, valign: "top" }
      );
    }
    if (data.table) {
      slide.addTable(
        data.table.map((row, i) => row.map((cell) => ({ text: cell, options: { bold: i === 0, ...(i === 0 && { fill: { color: theme.headerFill }, color: theme.headerText }) } }))),
        { x: X, y: data.lines.length > 0 ? 1.4 + textHeight : 1.3, w: W, fontSize: 12, color: theme.ink, border: { type: "solid", color: theme.line, pt: 1 } }
      );
    }
  }
  return Buffer.from((await pres.write({ outputType: "nodebuffer" })) as Buffer);
}
