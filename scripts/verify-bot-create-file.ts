import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { buildFile } from "../src/lib/botFileCreate";
import { prepareFileForBot } from "../src/lib/botFilePrep";
import { mimeFromFileName } from "../src/lib/uploadLimits";

const SAMPLE = `# Informe de gestión

Avance del **diseño** en el año: señal de éxito.

## Fases

- Diseño terminado
- Construcción en curso

| Fase | Avance | Código |
|---|---|---|
| Diseño | 80 | 007 |
| Construcción | 12,5 | A-1 |
`;

async function build(name: string, content = SAMPLE) {
  const r = await buildFile(name, content);
  assert.ok(r.ok, `${name}: ${r.ok ? "" : r.error}`);
  return r;
}

async function readBack(name: string) {
  const r = await build(name);
  const out = await prepareFileForBot(r.buffer, r.name, mimeFromFileName(r.name));
  return typeof out === "string" ? out : JSON.stringify(out);
}

async function zipText(buffer: Buffer, match: RegExp) {
  const zip = await JSZip.loadAsync(buffer);
  const names = Object.keys(zip.files).filter((n) => match.test(n)).sort();
  return (await Promise.all(names.map((n) => zip.file(n)!.async("string")))).join("\n");
}

async function main() {
  const today = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", dateStyle: "long" }).format(new Date());

  const docx = await readBack("Informe de gestión.docx");
  for (const expected of ["Informe de gestión", today, "señal de éxito", "Diseño terminado", "Construcción", "12,5"]) assert.ok(docx.includes(expected), `docx sin «${expected}»`);
  const docxFooter = await zipText((await build("a.docx")).buffer, /^word\/footer/);
  assert.match(docxFooter, /Página/, "docx sin número de página");

  const pdf = await readBack("informe.pdf");
  for (const expected of ["Informe de gestión", today, "señal de éxito", "Diseño terminado", "Avance", "Página 1 de 1"]) assert.ok(pdf.includes(expected), `pdf sin «${expected}»`);
  assert.ok((await build("emoji.pdf", "# Título\n\nListo ✅ señor")).ok);

  const xlsx = await build("tabla.xlsx");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(xlsx.buffer as unknown as ArrayBuffer);
  const ws = wb.getWorksheet("Fases");
  assert.ok(ws, "xlsx sin la hoja «Fases»");
  const values = (n: number) => (ws.getRow(n).values as unknown[]).slice(1);
  let header = 0;
  ws.eachRow((row, n) => {
    if (row.getCell(1).value === "Fase") header = n;
  });
  assert.ok(header > 0, "xlsx sin encabezados");
  assert.equal(ws.getRow(header).getCell(1).font?.bold, true, "encabezado sin resaltar");
  assert.deepEqual(values(header + 1), ["Diseño", 80, "007"]);
  assert.deepEqual(values(header + 2), ["Construcción", 12.5, "A-1"]);

  const pptx = await build("presentación.pptx");
  const slides = await zipText(pptx.buffer, /^ppt\/slides\/slide\d+\.xml$/);
  for (const expected of ["Informe de gestión", today, "Fases", "Diseño terminado", "Construcción"]) assert.ok(slides.includes(expected), `pptx sin «${expected}»`);
  assert.equal(Object.keys((await JSZip.loadAsync(pptx.buffer)).files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).length, 3, "portada, introducción y Fases");

  for (const name of ["nota.md", "nota.txt", "pagina.html"]) assert.equal((await build(name, "año ñ")).buffer.toString("utf8"), "año ñ");
  assert.equal((await build("datos.csv", "a;b\nñ;1")).buffer.toString("utf8"), "﻿a;b\nñ;1");

  assert.equal((await build('mi/informe: "final"?.DOCX')).name, "mi informe final.docx");
  assert.equal((await build("pagina.htm", "x")).name, "pagina.html");
  assert.equal((await build("../../.docx")).name, "archivo.docx");

  for (const [name, content] of [["informe.docx", "   "], ["informe.exe", "x"], ["informe", "x"], ["viejo.doc", "x"]] as const) {
    const r = await buildFile(name, content);
    assert.equal(r.ok, false, `${name} debía fallar`);
    if (!r.ok) assert.ok(r.error.length > 10);
  }

  console.log("verify:bot-create-file OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
