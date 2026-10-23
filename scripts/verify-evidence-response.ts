import assert from "node:assert/strict";
import { isResponseEvidence, canAddAcceptanceEvidence } from "../src/lib/taskDesign";
import { reviewImages } from "../src/lib/notifications";

// Regla de quién subió cada evidencia de una prueba o característica (Revisor / Entrega / Respuesta).
// Prueba: el revisor con la ronda abierta sube evidencia de revisor; quien no revisa, o cualquiera con la ronda cerrada, responde.
assert.equal(isResponseEvidence("QA", { result: "FAILED", roundClosed: false }, true), false);
assert.equal(isResponseEvidence("QA", { result: "FAILED", roundClosed: false }, false), true);
assert.equal(isResponseEvidence("QA", { result: "FAILED", roundClosed: true }, true), true);
// Aceptación: antes de calificar es la entrega; en una característica devuelta es la respuesta.
assert.equal(isResponseEvidence("ACCEPTANCE", { result: null, roundClosed: false }, false), false);
assert.equal(isResponseEvidence("ACCEPTANCE", { result: "FAILED", roundClosed: true }, false), true);
assert.equal(canAddAcceptanceEvidence({ result: null, roundClosed: false }), true);
assert.equal(canAddAcceptanceEvidence({ result: "FAILED", roundClosed: true }), true);
assert.equal(canAddAcceptanceEvidence({ result: "APPROVED", roundClosed: true }), false);
assert.equal(canAddAcceptanceEvidence({ result: null, roundClosed: true }), false);
// Fotos del aviso de WhatsApp: devuelta → imágenes del revisor de esta ronda en pruebas con errores;
// reenviada → imágenes de respuesta subidas desde la devolución.
const d = (iso: string) => new Date(iso);
const ev = (fileUrl: string, isResponse: boolean, at: string, mimeType = "image/png") => ({ fileUrl, mimeType, isResponse, uploadedAt: d(at) });
const r1 = { submittedAt: d("2026-10-01"), closedAt: d("2026-10-05"), checks: [
  { result: "FAILED", evidence: [ev("/uploads/rev.png", false, "2026-10-03"), ev("/uploads/doc.pdf", false, "2026-10-03", "application/pdf")] },
  { result: "APPROVED", evidence: [ev("/uploads/ok.png", false, "2026-10-03")] },
] };
assert.deepEqual(reviewImages("returned", r1), ["/uploads/rev.png"]);
const r2 = { submittedAt: d("2026-10-08"), closedAt: null, checks: [
  { result: null, evidence: [ev("/uploads/rev.png", false, "2026-10-03"), ev("/uploads/fix.png", true, "2026-10-06"), ev("/uploads/old-fix.png", true, "2026-09-20")] },
] };
assert.deepEqual(reviewImages("requested", r2, r1), ["/uploads/fix.png"]);
assert.deepEqual(reviewImages("approved", r2, r1), []);
console.log("✓ evidencia de revisor, entrega y respuesta");
process.exit(0);
