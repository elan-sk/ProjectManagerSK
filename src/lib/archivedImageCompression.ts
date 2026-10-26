import { access, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { contentFileName } from "@/lib/uploadFile";
import { findUploadPath, uploadSearchDirs, uploadWriteDir } from "@/lib/persistentUploads";
import { EXACT_REFS, FILE_ROW_MODELS, TEXT_REFS, UPLOAD_URL, countFileReferences, rewriteUploadReferences } from "@/lib/fileReferences";

const MAX_SIDE = 2560;
const QUALITY = 80;
const PROTECT = "!protect";
const NEUTRAL = "!neutral";
const COMPRESSIBLE = /\.(png|jpe?g)$/i;
const LINKING_FILES = /\.(md|html?|txt)$/i;

type Row = Record<string, string | null>;
type Usage = "active" | "archived" | "deleted" | typeof PROTECT;
type Maps = {
  projectState: Map<string, Exclude<Usage, typeof PROTECT>>;
  taskProject: Map<string, string>;
  roundTask: Map<string, string>;
  checkRound: Map<string, string>;
  messageRound: Map<string, string>;
  itemTask: Map<string, string>;
};
type Delegate = {
  findMany: (args: { where?: Record<string, unknown>; select: Record<string, boolean> }) => Promise<Row[]>;
  update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
};
const model = (name: string) => (prisma as unknown as Record<string, Delegate>)[name];

const viaTask = (m: Maps, taskId: string | null | undefined) => (taskId ? m.taskProject.get(taskId) : undefined);
const viaRound = (m: Maps, roundId: string | null | undefined) => viaTask(m, roundId ? m.roundTask.get(roundId) : undefined);
const viaCheck = (m: Maps, checkId: string | null | undefined) => viaRound(m, checkId ? m.checkRound.get(checkId) : undefined);
const viaItem = (m: Maps, itemId: string | null | undefined) => viaTask(m, itemId ? m.itemTask.get(itemId) : undefined);

const OWNERS: Record<string, { select: string[]; owner: (r: Row, m: Maps) => string | null | undefined }> = {
  attachment: { select: ["taskId"], owner: (r, m) => viaTask(m, r.taskId) },
  projectAttachment: { select: ["projectId"], owner: (r) => r.projectId },
  adjustmentAttachment: { select: ["adjustmentItemId"], owner: (r, m) => viaItem(m, r.adjustmentItemId) },
  reviewDeliverable: { select: ["reviewRoundId"], owner: (r, m) => viaRound(m, r.reviewRoundId) },
  reviewCheckEvidence: { select: ["reviewCheckId"], owner: (r, m) => viaCheck(m, r.reviewCheckId) },
  reviewMessageAttachment: { select: ["reviewMessageId"], owner: (r, m) => viaRound(m, r.reviewMessageId ? m.messageRound.get(r.reviewMessageId) : undefined) },
  project: { select: ["id"], owner: (r) => r.id },
  internalMessage: { select: ["projectId"], owner: (r) => r.projectId },
  shareComment: {
    select: ["projectId", "taskId", "adjustmentItemId", "reviewCheckId"],
    owner: (r, m) => r.projectId ?? viaTask(m, r.taskId) ?? viaItem(m, r.adjustmentItemId) ?? viaCheck(m, r.reviewCheckId),
  },
  reviewMessage: { select: ["reviewRoundId"], owner: (r, m) => viaRound(m, r.reviewRoundId) },
  task: { select: ["projectId"], owner: (r) => r.projectId },
  objective: { select: ["projectId"], owner: (r) => r.projectId },
  requirement: { select: ["projectId"], owner: (r) => r.projectId },
  taskStep: { select: ["taskId"], owner: (r, m) => viaTask(m, r.taskId) },
  adjustmentItem: { select: ["taskId"], owner: (r, m) => viaTask(m, r.taskId) },
  reviewCheck: { select: ["reviewRoundId"], owner: (r, m) => viaRound(m, r.reviewRoundId) },
  botMessage: { select: [], owner: () => NEUTRAL },
  notification: { select: [], owner: () => NEUTRAL },
  groupAlertItem: { select: [], owner: () => NEUTRAL },
  whatsAppQueueItem: { select: [], owner: () => NEUTRAL },
};

async function loadMaps(): Promise<Maps> {
  const [projects, tasks, rounds, checks, messages, items] = await Promise.all([
    prisma.project.findMany({ select: { id: true, status: true, archivedAt: true } }),
    prisma.task.findMany({ select: { id: true, projectId: true } }),
    prisma.reviewRound.findMany({ select: { id: true, taskId: true } }),
    prisma.reviewCheck.findMany({ select: { id: true, reviewRoundId: true } }),
    prisma.reviewMessage.findMany({ select: { id: true, reviewRoundId: true } }),
    prisma.adjustmentItem.findMany({ select: { id: true, taskId: true } }),
  ]);
  return {
    projectState: new Map(projects.map((p) => [p.id, p.status === "ARCHIVED" ? "deleted" : p.archivedAt ? "archived" : "active"])),
    taskProject: new Map(tasks.map((t) => [t.id, t.projectId])),
    roundTask: new Map(rounds.map((r) => [r.id, r.taskId])),
    checkRound: new Map(checks.map((c) => [c.id, c.reviewRoundId])),
    messageRound: new Map(messages.map((x) => [x.id, x.reviewRoundId])),
    itemTask: new Map(items.map((i) => [i.id, i.taskId])),
  };
}

async function linkedFromUploadedFiles(): Promise<Set<string>> {
  const linked = new Set<string>();
  const seen = new Set<string>();
  for (const dir of await uploadSearchDirs()) {
    for (const name of await readdir(dir).catch(() => [] as string[])) {
      if (!LINKING_FILES.test(name) || seen.has(name)) continue;
      seen.add(name);
      const text = await readFile(path.join(dir, name), "utf8").catch(() => "");
      for (const url of text.match(UPLOAD_URL) ?? []) linked.add(url);
    }
  }
  return linked;
}

export async function classifyImageUsage(onlyUrls?: Set<string>): Promise<Map<string, Set<Usage>>> {
  const maps = await loadMaps();
  const usage = new Map<string, Set<Usage>>();
  const add = (url: string, owner: string | null | undefined) => {
    if (!COMPRESSIBLE.test(url) || (onlyUrls && !onlyUrls.has(url)) || owner === NEUTRAL) return;
    const state: Usage = owner && owner !== PROTECT ? (maps.projectState.get(owner) ?? PROTECT) : PROTECT;
    if (!usage.has(url)) usage.set(url, new Set());
    usage.get(url)!.add(state);
  };
  for (const [name, field] of [...EXACT_REFS, ...TEXT_REFS]) {
    const spec = OWNERS[name];
    const select = Object.fromEntries([field, ...(spec?.select ?? [])].map((f) => [f, true]));
    const isText = TEXT_REFS.some(([m, f]) => m === name && f === field);
    for (const row of await model(name).findMany({ select })) {
      const value = row[field];
      if (!value) continue;
      const owner = spec ? spec.owner(row, maps) : PROTECT;
      for (const url of isText ? (value.match(UPLOAD_URL) ?? []) : [value]) add(url, owner);
    }
  }
  for (const url of await linkedFromUploadedFiles()) {
    if (usage.has(url)) usage.get(url)!.add(PROTECT);
  }
  return usage;
}

const isCandidate = (states: Set<Usage>) => !states.has(PROTECT) && !states.has("active") && states.size > 0;

export type CompressionSummary = { compressed: number; deleted: number; notSmaller: number; missing: number; failed: number; referencesUpdated: number; bytesFreed: number };

export async function compressArchivedImages(options: { onlyUrls?: string[] } = {}): Promise<CompressionSummary> {
  const summary: CompressionSummary = { compressed: 0, deleted: 0, notSmaller: 0, missing: 0, failed: 0, referencesUpdated: 0, bytesFreed: 0 };
  const only = options.onlyUrls ? new Set(options.onlyUrls) : undefined;
  const writeDir = await uploadWriteDir();
  const usage = await classifyImageUsage(only);
  const mapping = new Map<string, string>();
  const originals = new Map<string, { file: string; size: number }>();
  const toDelete: string[] = [];

  for (const [url, states] of usage) {
    if (!isCandidate(states)) continue;
    if (!states.has("archived")) {
      toDelete.push(url);
      continue;
    }
    try {
      const file = await findUploadPath(url);
      if (!file) {
        summary.missing++;
        continue;
      }
      const original = await readFile(file);
      const webp = await sharp(original).rotate().resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true }).webp({ quality: QUALITY }).toBuffer();
      if (webp.length >= original.length) {
        summary.notSmaller++;
        continue;
      }
      const target = path.join(writeDir, contentFileName(webp, ".webp"));
      if (!(await access(target).then(() => true, () => false))) await writeFile(target, webp);
      mapping.set(url, `/uploads/${path.basename(target)}`);
      originals.set(url, { file, size: original.length - webp.length });
    } catch (err) {
      summary.failed++;
      logger.error("compresion", `No se pudo comprimir ${url}`, err instanceof Error ? err.message : String(err));
    }
  }

  if (mapping.size > 0) {
    summary.referencesUpdated = await rewriteUploadReferences(mapping);
    const newUrls = [...mapping.values()];
    for (const name of FILE_ROW_MODELS) {
      for (const row of await model(name).findMany({ where: { fileUrl: { in: newUrls } }, select: { id: true, fileName: true, mimeType: true } })) {
        if (row.mimeType === "image/webp") continue;
        await model(name).update({ where: { id: row.id! }, data: { mimeType: "image/webp", fileName: (row.fileName ?? "").replace(COMPRESSIBLE, ".webp") } });
      }
    }
    for (const [url, { file, size }] of originals) {
      try {
        if (path.dirname(file) !== writeDir || (await countFileReferences(url)) > 0) continue;
        await unlink(file);
        summary.compressed++;
        summary.bytesFreed += size;
      } catch (err) {
        summary.failed++;
        logger.error("compresion", `No se pudo borrar el original ${url}`, err instanceof Error ? err.message : String(err));
      }
    }
  }

  if (toDelete.length > 0) {
    const recheck = await classifyImageUsage(new Set(toDelete));
    for (const url of toDelete) {
      const states = recheck.get(url);
      if (!states || !isCandidate(states) || states.has("archived")) continue;
      try {
        const file = await findUploadPath(url);
        if (!file) {
          summary.missing++;
          continue;
        }
        if (path.dirname(file) !== writeDir) continue;
        const { size } = await stat(file);
        await unlink(file);
        summary.deleted++;
        summary.bytesFreed += size;
      } catch (err) {
        summary.failed++;
        logger.error("compresion", `No se pudo borrar ${url}`, err instanceof Error ? err.message : String(err));
      }
    }
  }

  logger.info("compresion", "Imágenes de proyectos archivados y eliminados", { ...summary, espacioLiberadoMB: Math.round((summary.bytesFreed / 1024 / 1024) * 10) / 10 });
  return summary;
}

let running = false;
let pending = false;

export function scheduleArchivedImageCompression() {
  if (running) {
    pending = true;
    return;
  }
  running = true;
  void (async () => {
    try {
      do {
        pending = false;
        await compressArchivedImages();
      } while (pending);
    } catch (err) {
      logger.error("compresion", "Falló la compresión de imágenes", err instanceof Error ? (err.stack ?? err.message) : String(err));
    } finally {
      running = false;
    }
  })();
}
