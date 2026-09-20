import type Anthropic from "@anthropic-ai/sdk";

// Preparación de archivos SOLO para el bot (Chontatec): se convierte en memoria
// lo que ya guardó la app, para gastar menos tokens de entrada en Anthropic.
// El archivo original nunca se toca ni se reemplaza — la gente sigue viendo y
// descargando el archivo normal. Mismo criterio que "Adjuntar documentos" de
// LensSK: PDF → texto por página, DOCX → texto, XLSX → tabla Markdown por hoja,
// imagen → JPEG comprimido, tope de 12000 caracteres por documento.
export type PreparedContent = string | Anthropic.ToolResultBlockParam["content"];

const MAX_CHARS = 12_000;
const IMAGE_MAX_DIM = 1400;
const IMAGE_JPEG_QUALITY = 80;

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function capText(text: string): string {
  const clean = text.trim();
  if (clean.length <= MAX_CHARS) return clean;
  return `${clean.slice(0, MAX_CHARS)}\n\n[…texto cortado a ${MAX_CHARS} caracteres; el archivo es más largo]`;
}

const cell = (v: unknown) =>
  (v == null ? "" : typeof v === "object" ? ((v as { text?: string; result?: unknown }).text ?? String((v as { result?: unknown }).result ?? "")) : String(v)).replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();

async function xlsxToMarkdown(buffer: Buffer) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const out: string[] = [];
  workbook.eachSheet((sheet) => {
    const rows: string[][] = [];
    sheet.eachRow((row) => rows.push((row.values as unknown[]).slice(1).map(cell)));
    if (rows.length === 0) return;
    const width = Math.max(...rows.map((r) => r.length));
    const pad = (r: string[]) => `| ${Array.from({ length: width }, (_, i) => r[i] ?? "").join(" | ")} |`;
    out.push(`## Hoja: ${sheet.name}`, pad(rows[0]), `| ${Array(width).fill("---").join(" | ")} |`, ...rows.slice(1).map(pad), "");
  });
  return out.join("\n");
}

// .docx = zip con word/document.xml: alcanza para sacar el texto por párrafo.
async function docxToText(buffer: Buffer) {
  const JSZip = (await import("jszip")).default;
  const xml = await (await JSZip.loadAsync(buffer)).file("word/document.xml")?.async("string");
  if (!xml) return "";
  return xml
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

// Texto real por página. Si el PDF no trae capa de texto (escaneado) devuelve "".
async function pdfToText(buffer: Buffer) {
  // ponytail: build "legacy" de pdfjs-dist 3.11 (CJS, corre en Node sin canvas); solo extrae texto.
  const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.js")) as unknown as {
    getDocument: (o: object) => { promise: Promise<{ numPages: number; getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: { str?: string }[] }> }> }> };
  };
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true, isEvalSupported: false, disableFontFace: true }).promise;
  const pages: string[] = [];
  for (let n = 1; n <= doc.numPages && pages.join("").length < MAX_CHARS * 2; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    const text = content.items.map((i) => i.str ?? "").join(" ").replace(/\s+/g, " ").trim();
    if (text) pages.push(`## Página ${n}\n${text}`);
  }
  return pages.join("\n\n");
}

/**
 * Devuelve el contenido del archivo listo para mandar a Anthropic, lo más
 * liviano posible. Si una conversión falla o no aplica, cae al archivo tal cual
 * (PDF nativo / imagen original) para no perder información.
 */
export async function prepareFileForBot(buffer: Buffer, fileName: string, mimeType: string): Promise<PreparedContent> {
  if (mimeType.startsWith("text/")) return capText(buffer.toString("utf8"));

  if (mimeType === XLSX_MIME) return capText(await xlsxToMarkdown(buffer));

  if (mimeType === DOCX_MIME) {
    const text = await docxToText(buffer).catch(() => "");
    return text.trim() ? capText(text) : JSON.stringify({ error: "No pude extraer texto de este Word." });
  }

  if (mimeType === "application/pdf") {
    const text = await pdfToText(buffer).catch(() => "");
    if (text.trim()) return capText(text);
    // Sin capa de texto (escaneado): se manda el PDF nativo para que Claude lo vea.
    return [{ type: "document", title: fileName, source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") } }];
  }

  if (mimeType.startsWith("image/")) {
    try {
      const sharp = (await import("sharp")).default;
      const jpeg = await sharp(buffer)
        .rotate()
        .resize({ width: IMAGE_MAX_DIM, height: IMAGE_MAX_DIM, fit: "inside", withoutEnlargement: true })
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: IMAGE_JPEG_QUALITY })
        .toBuffer();
      return [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: jpeg.toString("base64") } }];
    } catch {
      return [{ type: "image", source: { type: "base64", media_type: mimeType as "image/png", data: buffer.toString("base64") } }];
    }
  }

  return JSON.stringify({ error: "Este formato (PowerPoint, .xls antiguo) no se puede leer desde el chat. Solo puedo ver su nombre." });
}
