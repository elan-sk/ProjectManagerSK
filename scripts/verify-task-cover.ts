import assert from "node:assert/strict";
import { taskCoverUrl } from "../src/lib/taskCover";

const at = (id: string, mimeType: string, day: number) => ({ id, fileUrl: `/uploads/${id}`, mimeType, uploadedAt: new Date(2026, 0, day) });
// Desordenadas a propósito: la portada automática es la imagen MÁS ANTIGUA, no la primera de la lista.
const attachments = [at("b", "image/png", 3), at("doc", "application/pdf", 1), at("a", "image/jpeg", 2)];

assert.equal(taskCoverUrl({ coverAttachmentId: null, coverHidden: false, attachments }), "/uploads/a");
assert.equal(taskCoverUrl({ coverAttachmentId: "b", coverHidden: false, attachments }), "/uploads/b");
assert.equal(taskCoverUrl({ coverAttachmentId: "borrada", coverHidden: false, attachments }), "/uploads/a");
assert.equal(taskCoverUrl({ coverAttachmentId: "doc", coverHidden: false, attachments }), "/uploads/a");
assert.equal(taskCoverUrl({ coverAttachmentId: "b", coverHidden: true, attachments }), null);
assert.equal(taskCoverUrl({ coverAttachmentId: null, coverHidden: false, attachments: [at("doc", "application/pdf", 1)] }), null);
console.log("OK: portada de tarea");
