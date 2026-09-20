import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import sharp from "sharp";
import { prepareFileForBot } from "../src/lib/botFilePrep";

// Preparación de archivos para el bot: convierte/comprime en memoria, sin escribir nada.
const text = (c: unknown) => (typeof c === "string" ? c : JSON.stringify(c));

async function main() {
  // XLSX → tabla Markdown por hoja
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Ventas");
  ws.addRow(["Producto", "Cantidad"]);
  ws.addRow(["Café", 12]);
  const xlsx = Buffer.from(await wb.xlsx.writeBuffer());
  const md = text(await prepareFileForBot(xlsx, "v.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"));
  assert.match(md, /## Hoja: Ventas/);
  assert.match(md, /\| Café \| 12 \|/);

  // DOCX → texto plano
  const zip = new JSZip();
  zip.file("word/document.xml", '<w:document><w:body><w:p><w:r><w:t>Hola &amp; adiós</w:t></w:r></w:p><w:p><w:r><w:t>Segundo párrafo</w:t></w:r></w:p></w:body></w:document>');
  const docx = await zip.generateAsync({ type: "nodebuffer" });
  const dt = text(await prepareFileForBot(docx, "a.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"));
  assert.equal(dt, "Hola & adiós\nSegundo párrafo");

  // PDF con texto → "## Página N" (PDF mínimo hecho a mano)
  const objs = ["<</Type/Catalog/Pages 2 0 R>>", "<</Type/Pages/Kids[3 0 R]/Count 1>>", "<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 100]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>", "", "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>"];
  const stream = "BT /F1 12 Tf 10 50 Td (Texto del PDF) Tj ET";
  objs[3] = `<</Length ${stream.length}>>\nstream\n${stream}\nendstream`;
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("")}trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`;
  const pt = text(await prepareFileForBot(Buffer.from(pdf), "a.pdf", "application/pdf"));
  assert.match(pt, /## Página 1\nTexto del PDF/);

  // Texto largo → se corta a 12000
  const long = text(await prepareFileForBot(Buffer.from("x".repeat(20_000)), "a.txt", "text/plain"));
  assert.ok(long.length < 12_200 && long.includes("texto cortado"));

  // Imagen grande → JPEG ≤ 1400 px y mucho más liviana
  const png = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#3366cc" } }).png().toBuffer();
  const img = (await prepareFileForBot(png, "a.png", "image/png")) as { type: string; source: { media_type: string; data: string } }[];
  assert.equal(img[0].source.media_type, "image/jpeg");
  const meta = await sharp(Buffer.from(img[0].source.data, "base64")).metadata();
  assert.ok(Math.max(meta.width!, meta.height!) <= 1400);

  // PowerPoint no se lee
  assert.match(text(await prepareFileForBot(Buffer.from("x"), "a.pptx", "application/vnd.ms-powerpoint")), /no se puede leer/);
  console.log("verify-bot-file-prep: OK");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
