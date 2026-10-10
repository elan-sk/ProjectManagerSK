import { marked, type Token } from "marked";

export type BuiltFile = { ok: true; name: string; buffer: Buffer } | { ok: false; error: string };

type Run = { text: string; bold?: boolean };
type Block =
  | { kind: "heading"; level: number; runs: Run[] }
  | { kind: "paragraph"; runs: Run[] }
  | { kind: "list"; items: { runs: Run[]; level: number; marker: string }[] }
  | { kind: "table"; rows: string[][] };
type Doc = { title: string; date: string; blocks: Block[] };

const FORMATS_TEXT = "Word (.docx), Excel (.xlsx), PDF (.pdf), PowerPoint (.pptx), Markdown (.md), texto (.txt), CSV (.csv) y HTML (.html)";
const RAW_EXTENSIONS = new Set([".md", ".txt", ".csv", ".html"]);
const BUILDERS: Record<string, (doc: Doc) => Promise<Buffer>> = { ".docx": buildDocx, ".pdf": buildPdf, ".xlsx": buildXlsx, ".pptx": buildPptx };

const INK = "0F172A";
const MUTED = "64748B";
const LINE = "CBD5E1";
const HEADER_FILL = "E2E8F0";

export async function buildFile(fileName: string, content: string): Promise<BuiltFile> {
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
  return { ok: true, name, buffer: await BUILDERS[ext]({ title, date, blocks }) };
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

async function buildDocx({ title, date, blocks }: Doc) {
  const { AlignmentType, Document, Footer, HeadingLevel, Packer, PageNumber, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType } = await import("docx");
  const CONTENT_WIDTH = 9026;
  const runs = (list: Run[]) => list.map((r) => new TextRun({ text: r.text, bold: r.bold }));
  const headings = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3];

  const children = blocks.flatMap((b) => {
    if (b.kind === "heading") return [new Paragraph({ heading: headings[Math.min(b.level, 3) - 1], children: runs(b.runs), spacing: { before: 240, after: 120 } })];
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
                    shading: i === 0 ? { type: ShadingType.CLEAR, fill: HEADER_FILL, color: "auto" } : undefined,
                    children: [new Paragraph({ children: [new TextRun({ text: cell, bold: i === 0 })] })],
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
        footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: ["Página ", PageNumber.CURRENT], color: MUTED, size: 18 })] })] }) },
        children: [
          new Paragraph({ children: [new TextRun({ text: title, bold: true, size: 40, color: INK })] }),
          new Paragraph({ children: [new TextRun({ text: date, color: MUTED, size: 20 })], spacing: { after: 320 }, border: { bottom: { style: "single", size: 6, color: LINE, space: 8 } } }),
          ...children,
        ],
      },
    ],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}

async function buildPdf({ title, date, blocks }: Doc) {
  const PDFDocument = (await import("pdfkit")).default;
  const doc = new PDFDocument({ size: "A4", margin: 56, bufferPages: true, info: { Title: title } });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const clean = (text: string) => text.replace(/[^\t\n\x20-\x7E\xA0-\xFF–—‘’“”•…€]/g, "").replace(/ {2,}/g, " ");
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const write = (runs: Run[], size: number, x = left, forceBold = false) => {
    const parts = runs.map((r) => ({ ...r, text: clean(r.text) })).filter((r) => r.text);
    if (parts.length === 0) return;
    doc.fontSize(size).fillColor(`#${INK}`);
    doc.x = x;
    parts.forEach((r, i) => doc.font(forceBold || r.bold ? "Helvetica-Bold" : "Helvetica").text(r.text, { continued: i < parts.length - 1, width: width - (x - left) }));
    doc.x = left;
  };

  write([{ text: title }], 20, left, true);
  doc.font("Helvetica").fontSize(10).fillColor(`#${MUTED}`).text(clean(date));
  doc.moveDown(0.5).moveTo(left, doc.y).lineTo(left + width, doc.y).strokeColor(`#${LINE}`).stroke().moveDown(1);

  for (const b of blocks) {
    if (b.kind === "heading") {
      doc.moveDown(0.4);
      write(b.runs, [15, 13, 12][Math.min(b.level, 3) - 1], left, true);
      doc.moveDown(0.3);
    } else if (b.kind === "paragraph") {
      write(b.runs, 11);
      doc.moveDown(0.6);
    } else if (b.kind === "list") {
      for (const item of b.items) write([{ text: `${item.marker} ` }, ...item.runs], 11, left + 14 * (item.level + 1));
      doc.moveDown(0.6);
    } else {
      doc.font("Helvetica").fontSize(10).fillColor(`#${INK}`);
      doc.table({
        defaultStyle: { border: 0.5, borderColor: `#${LINE}`, padding: 5 },
        data: padded(b.rows).map((row, i) => row.map((cell) => ({ text: clean(cell), ...(i === 0 && { backgroundColor: `#${HEADER_FILL}`, font: { src: "Helvetica-Bold" } }) }))),
      });
      doc.x = left;
      doc.moveDown(1);
    }
  }

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0;
    doc.font("Helvetica").fontSize(9).fillColor(`#${MUTED}`).text(`Página ${i + 1} de ${range.count}`, left, doc.page.height - 36, { width, align: "center", lineBreak: false });
  }
  doc.end();
  return finished;
}

function cellValue(text: string): string | number {
  const value = text.trim();
  return /^-?(0|[1-9]\d{0,14})([.,]\d{1,2})?$/.test(value) ? Number(value.replace(",", ".")) : value;
}

async function buildXlsx({ title, blocks }: Doc) {
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
        added.font = { bold: true };
        added.eachCell((cell) => (cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${HEADER_FILL}` } }));
      });
    }
  }
  if (workbook.worksheets.length === 0) sheetFor();
  for (const ws of workbook.worksheets) {
    ws.columns.forEach((column) => {
      let longest = 8;
      column.eachCell?.({ includeEmpty: false }, (cell) => (longest = Math.max(longest, String(cell.value ?? "").length)));
      column.width = Math.min(longest + 2, 60);
    });
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function buildPptx({ title, date, blocks }: Doc) {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_WIDE";
  pres.title = title;
  const X = 0.6;
  const W = 12.1;

  const cover = pres.addSlide();
  cover.addText(title, { x: X, y: 2.3, w: W, h: 1.6, fontSize: 36, bold: true, color: INK, valign: "bottom" });
  cover.addText(date, { x: X, y: 4.0, w: W, h: 0.5, fontSize: 16, color: MUTED });

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
    slide.slideNumber = { x: 12.2, y: 6.95, fontSize: 10, color: MUTED };
    slide.addText(data.title, { x: X, y: 0.35, w: W, h: 0.8, fontSize: 26, bold: true, color: INK });
    const textHeight = data.table ? Math.min(0.45 * data.lines.length + 0.2, 2.4) : 5.4;
    if (data.lines.length > 0) {
      slide.addText(
        data.lines.map((line) => ({ text: line.text, options: { bullet: line.bullet ? { indent: 18 } : false, indentLevel: line.level, breakLine: true } })),
        { x: X, y: 1.3, w: W, h: textHeight, fontSize: data.table ? 14 : 18, color: INK, valign: "top" }
      );
    }
    if (data.table) {
      slide.addTable(
        data.table.map((row, i) => row.map((cell) => ({ text: cell, options: { bold: i === 0, ...(i === 0 && { fill: { color: HEADER_FILL } }) } }))),
        { x: X, y: data.lines.length > 0 ? 1.4 + textHeight : 1.3, w: W, fontSize: 12, color: INK, border: { type: "solid", color: LINE, pt: 1 } }
      );
    }
  }
  return Buffer.from((await pres.write({ outputType: "nodebuffer" })) as Buffer);
}
