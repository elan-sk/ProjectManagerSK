import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { contentFileName, isContentFileName, normalizeExt } from "../src/lib/uploadFile";
import { inSection, splitNew } from "../src/lib/attachmentDedup";
import { EXACT_REFS, TEXT_REFS, countFileReferences, table } from "../src/lib/fileReferences";
import { alreadyLoadedMessage } from "../src/lib/duplicateNotice";

// Spec 001 — archivos sin duplicados. Parte pura + datos temporales en la base local
// (los crea y los borra).
async function main() {
  // RF-1/RF-2: el nombre es la huella del contenido; .jpeg y .jpg dan lo mismo.
  const a = Buffer.from("mismo contenido");
  assert.equal(contentFileName(a, ".png"), contentFileName(Buffer.from("mismo contenido"), ".PNG"), "mismo contenido → mismo nombre");
  assert.notEqual(contentFileName(a, ".png"), contentFileName(Buffer.from("otro"), ".png"), "otro contenido → otro nombre");
  assert.equal(contentFileName(a, ".jpeg"), contentFileName(a, ".jpg"), ".jpeg = .jpg");
  assert.equal(normalizeExt(".htm"), ".html");
  assert.ok(isContentFileName(contentFileName(a, ".pdf")));
  assert.ok(!isContentFileName("3f2a1b9c-1111-2222-3333-444455556666.pdf"), "un nombre viejo (uuid) no es por contenido");

  // RF-3: textos del aviso.
  assert.equal(alreadyLoadedMessage(["a.pdf"]), "Este archivo ya está cargado aquí.");
  assert.equal(alreadyLoadedMessage(["a.pdf", "b.png"]), "Ya estaban cargados aquí: a.pdf, b.png.");

  // Cada tabla/campo de la lista de referencias existe (si no, la consulta falla).
  for (const [model, field] of [...EXACT_REFS, ...TEXT_REFS]) await table(model).findMany({ select: { [field]: true } });

  const user = await prisma.user.findFirstOrThrow();
  const project = await prisma.project.create({
    data: { name: "__verify-file-dedup__", startDate: new Date("2026-09-07"), pmId: user.id, phases: { create: [{ name: "F1", order: 0 }] } },
    include: { phases: true },
  });
  const urlFile = `/uploads/${contentFileName(Buffer.from(`verify-${Date.now()}`), ".png")}`;
  const urlIcon = `/uploads/${contentFileName(Buffer.from(`icono-${Date.now()}`), ".png")}`;
  const urlText = `/uploads/${contentFileName(Buffer.from(`texto-${Date.now()}`), ".png")}`;
  try {
    const task = await prisma.task.create({
      data: { projectId: project.id, phaseId: project.phases[0].id, title: "T", plannedStart: new Date("2026-09-07"), plannedEnd: new Date("2026-09-08"), description: `<img src="${urlText}">` },
    });
    await prisma.attachment.create({ data: { taskId: task.id, kind: "INSUMO", fileUrl: urlFile, fileName: "a.png", mimeType: "image/png" } });

    // RF-3/RF-4: repetido solo en la MISMA sección.
    assert.equal(await inSection({ taskId: task.id, kind: "INSUMO" }, urlFile), true, "ya está en Insumos");
    assert.equal(await inSection({ taskId: task.id, kind: "RESULTADO" }, urlFile), false, "en Evidencias sí se permite");
    assert.equal(await inSection({ taskId: task.id, kind: "INSUMO" }, `  ${urlFile}  `), true, "ignora espacios de los extremos");
    const split = await splitNew({ taskId: task.id, kind: "INSUMO" }, [
      { url: urlFile, name: "a.png" },
      { url: "/uploads/nuevo.png", name: "nuevo.png" },
      { url: "/uploads/nuevo.png", name: "nuevo-otra-vez.png" },
    ]);
    assert.deepEqual(split.fresh.map((f) => f.name), ["nuevo.png"]);
    assert.deepEqual(split.skipped, ["a.png", "nuevo-otra-vez.png"], "lo de la sección y lo repetido en la misma carga");

    // RF-9: cuentan el adjunto, el ícono del proyecto y la imagen dentro de una descripción.
    await prisma.project.update({ where: { id: project.id }, data: { iconUrl: urlIcon } });
    assert.ok((await countFileReferences(urlFile)) >= 1, "adjunto");
    assert.ok((await countFileReferences(urlIcon)) >= 1, "ícono del proyecto");
    assert.ok((await countFileReferences(urlText)) >= 1, "imagen dentro de una descripción");
    assert.equal(await countFileReferences(`/uploads/${contentFileName(Buffer.from("nadie"), ".png")}`), 0, "sin usos");
  } finally {
    await prisma.attachment.deleteMany({ where: { task: { projectId: project.id } } });
    await prisma.task.deleteMany({ where: { projectId: project.id } });
    await prisma.project.delete({ where: { id: project.id } });
  }
  console.log("verify-file-dedup: OK");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
