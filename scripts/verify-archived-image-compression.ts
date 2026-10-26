import assert from "node:assert/strict";
import { access, mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { prisma } from "../src/lib/prisma";
import { contentFileName } from "../src/lib/uploadFile";
import { uploadWriteDir } from "../src/lib/persistentUploads";
import { compressArchivedImages } from "../src/lib/archivedImageCompression";

const exists = (file: string) => access(file).then(() => true, () => false);

async function noisePng(width: number) {
  return sharp({ create: { width, height: 300, channels: 3, background: "#808080", noise: { type: "gaussian", mean: 128, sigma: 40 } } }).png().toBuffer();
}

async function main() {
  const dir = await uploadWriteDir();
  await mkdir(dir, { recursive: true });
  const created: string[] = [];
  const save = async (buffer: Buffer, ext: string) => {
    const name = contentFileName(buffer, ext);
    await writeFile(path.join(dir, name), buffer);
    created.push(path.join(dir, name));
    return `/uploads/${name}`;
  };

  const onlyArchived = await save(await noisePng(3000), ".png");
  const sharedActive = await save(await noisePng(800), ".png");
  const onlyDeleted = await save(await noisePng(800), ".png");
  const archivedAndDeleted = await save(await noisePng(800), ".jpg");
  const linkedFromMd = await save(await noisePng(800), ".png");
  const svg = await save(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" data-v="${Date.now()}"/>`), ".svg");
  await save(Buffer.from(`# Nota ${Date.now()}\n\n![x](${linkedFromMd})\n`), ".md");
  const testUrls = [onlyArchived, sharedActive, onlyDeleted, archivedAndDeleted, linkedFromMd, svg];

  const user = await prisma.user.findFirstOrThrow();
  const makeProject = (name: string, data: Record<string, unknown>) =>
    prisma.project.create({ data: { name, startDate: new Date("2026-10-01"), pmId: user.id, phases: { create: [{ name: "F1", order: 0 }] }, ...data }, include: { phases: true } });
  const active = await makeProject("__verify-aic-active__", {});
  const archived = await makeProject("__verify-aic-archived__", { archivedAt: new Date() });
  const deleted = await makeProject("__verify-aic-deleted__", { status: "ARCHIVED" });
  const makeTask = (p: typeof active, description = "") =>
    prisma.task.create({ data: { projectId: p.id, phaseId: p.phases[0].id, title: "T", plannedStart: new Date("2026-10-01"), plannedEnd: new Date("2026-10-02"), description } });

  try {
    const tArchived = await makeTask(archived, `<p><img src="${sharedActive}"></p>`);
    const tActive = await makeTask(active);
    const tDeleted = await makeTask(deleted, `<img src="${archivedAndDeleted}">`);
    const att = (taskId: string, fileUrl: string, fileName: string, mimeType: string) =>
      prisma.attachment.create({ data: { taskId, kind: "INSUMO", fileUrl, fileName, mimeType } });
    const a1 = await att(tArchived.id, onlyArchived, "captura.png", "image/png");
    await att(tActive.id, sharedActive, "compartida.png", "image/png");
    const a3 = await att(tDeleted.id, onlyDeleted, "borrada.png", "image/png");
    const a4 = await att(tArchived.id, archivedAndDeleted, "foto.jpg", "image/jpeg");
    await att(tArchived.id, linkedFromMd, "enlazada.png", "image/png");
    await att(tArchived.id, svg, "logo.svg", "image/svg+xml");

    const summary = await compressArchivedImages({ onlyUrls: testUrls });

    const r1 = await prisma.attachment.findUniqueOrThrow({ where: { id: a1.id } });
    assert.match(r1.fileUrl, /^\/uploads\/[0-9a-f]{64}\.webp$/, "RF-1: solo en archivado → WebP");
    assert.equal(r1.fileName, "captura.webp", "RF-6: nombre .webp");
    assert.equal(r1.mimeType, "image/webp", "RF-6: tipo image/webp");
    const webpFile = path.join(dir, r1.fileUrl.slice("/uploads/".length));
    created.push(webpFile);
    const meta = await sharp(webpFile).metadata();
    assert.equal(meta.format, "webp");
    assert.equal(meta.width, 2560, "RF-4: lado máximo 2560 px");
    assert.equal(await exists(path.join(dir, onlyArchived.slice(9))), false, "RF-7: original borrado");

    const shared = await prisma.attachment.findFirstOrThrow({ where: { taskId: tActive.id } });
    assert.equal(shared.fileUrl, sharedActive, "RF-3: también en proyecto activo → no se toca");
    assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: tArchived.id } })).description?.includes(sharedActive), true);
    assert.ok(await exists(path.join(dir, sharedActive.slice(9))));

    assert.equal((await prisma.attachment.findUniqueOrThrow({ where: { id: a3.id } })).fileUrl, onlyDeleted);
    assert.equal(await exists(path.join(dir, onlyDeleted.slice(9))), false, "RF-2: solo en eliminados → se borra");

    const r4 = await prisma.attachment.findUniqueOrThrow({ where: { id: a4.id } });
    assert.match(r4.fileUrl, /\.webp$/, "RF-2: archivado + eliminado → WebP");
    assert.equal(r4.fileName, "foto.webp");
    created.push(path.join(dir, r4.fileUrl.slice(9)));
    assert.ok((await prisma.task.findUniqueOrThrow({ where: { id: tDeleted.id } })).description?.includes(r4.fileUrl), "RF-6: texto reescrito");

    const md = await prisma.attachment.findFirstOrThrow({ where: { taskId: tArchived.id, fileName: "enlazada.png" } });
    assert.equal(md.fileUrl, linkedFromMd, "RF-3: enlazada desde un .md → no se toca");
    const s = await prisma.attachment.findFirstOrThrow({ where: { taskId: tArchived.id, fileName: "logo.svg" } });
    assert.equal(s.fileUrl, svg, "RF-12: SVG no se toca");

    assert.equal(summary.compressed, 2);
    assert.equal(summary.deleted, 1);
    console.log("verify-archived-image-compression: OK", summary);
  } finally {
    for (const file of created) await unlink(file).catch(() => {});
    const ids = [active.id, archived.id, deleted.id];
    await prisma.attachment.deleteMany({ where: { task: { projectId: { in: ids } } } });
    await prisma.task.deleteMany({ where: { projectId: { in: ids } } });
    await prisma.project.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
