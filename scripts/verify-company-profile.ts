import assert from "node:assert/strict";
import { topicStates, nextPendingTopic, taskTypeContext, profileViewFor, type CompanyProfile } from "../src/lib/companyProfile";

const topics = [
  { key: "sector", text: "Agencia digital", skipped: false },
  { key: "business", text: null, skipped: true },
  { key: "clients", text: "Cafeteras de exportación", skipped: false },
  { key: "growth", text: "Duplicar clientes en 2027", skipped: false },
];

const states = topicStates(topics, "history");
assert.equal(states.total, 10);
assert.equal(states.covered, 3);
assert.equal(states.items.find((i) => i.key === "history")?.state, "current");
assert.equal(states.items.find((i) => i.key === "sector")?.state, "covered");
assert.equal(states.items.find((i) => i.key === "business")?.state, "pending");
assert.equal(states.items.find((i) => i.key === "business")?.skipped, true);

assert.equal(nextPendingTopic(topics), "history");
assert.equal(nextPendingTopic(topics, "purpose"), "workflow");
assert.equal(nextPendingTopic([]), "sector");

assert.equal(taskTypeContext([{ type: "QA", meaning: null, unused: false }]), "");
const ctx = taskTypeContext([
  { type: "QA", meaning: "Control de calidad de la muestra", unused: false },
  { type: "ACCEPTANCE", meaning: null, unused: true },
]);
assert.match(ctx, /Prueba \(QA\): Control de calidad de la muestra/);
assert.match(ctx, /Aceptación \(ACCEPTANCE\): No se usa/);

const profile: CompanyProfile = {
  name: "Depura",
  topics,
  documents: [{ id: "d1", url: "/uploads/brochure.pdf", name: "brochure.pdf", mimeType: "application/pdf" }],
  taskTypes: [{ type: "QA", meaning: "Control de calidad", unused: false }],
  focus: null,
};
const member = profileViewFor(profile, false);
const memberTopics = member.topics.map((t) => t.topic);
assert.ok(memberTopics.includes("Sector"));
assert.ok(memberTopics.includes("Cómo trabaja"));
assert.ok(!memberTopics.includes("Clientes"));
assert.ok(!memberTopics.includes("Crecimiento"));
assert.ok(!memberTopics.includes("Qué quiere revisar con la aplicación"));
assert.ok(!memberTopics.includes("Consejos que espera"));
assert.ok(!("documents" in member));
assert.ok(!JSON.stringify(member).includes("Duplicar clientes"));
assert.equal(member.taskTypes.length, 1);

const admin = profileViewFor(profile, true);
assert.equal(admin.topics.length, 10);
assert.ok("documents" in admin && admin.documents.length === 1);

console.log("verify:company-profile OK");

async function brandChecks() {
  const { normalizeHex, contrastRatio, themeColors, brandFooter, hasBrand } = await import("../src/lib/companyBrand");
  const { buildFile, DEFAULT_THEME } = await import("../src/lib/botFileCreate");
  const sharp = (await import("sharp")).default;

  assert.equal(normalizeHex("0a6b78"), "#0A6B78");
  assert.equal(normalizeHex("#abc"), "#AABBCC");
  assert.equal(normalizeHex(""), null);
  assert.equal(normalizeHex("azul"), "invalid");
  assert.ok(contrastRatio("#000000", "#FFFFFF") > 20);

  const empty = { logoUrl: null, logoPngUrl: null, iconUrl: null, iconPngUrl: null, primaryColor: null, secondaryColor: null, legalName: null, taxId: null, address: null, city: null, phone: null, email: null, website: null };
  assert.equal(hasBrand(empty), false);
  const dark = themeColors({ ...empty, primaryColor: "#073B4C", secondaryColor: "#E5C979" });
  assert.equal(dark.heading, "073B4C");
  assert.equal(dark.headerText, "FFFFFF");
  assert.equal(dark.line, "E5C979");
  const light = themeColors({ ...empty, primaryColor: "#FFE600" });
  assert.equal(light.heading, DEFAULT_THEME.heading);
  assert.equal(light.headerText, DEFAULT_THEME.ink);
  assert.deepEqual(brandFooter({ ...empty, legalName: "Estudio SAS", taxId: "900.1", city: "Medellín", email: "a@b.co" }), ["Estudio SAS · NIT 900.1", "Medellín · a@b.co"]);

  const logo = await sharp({ create: { width: 400, height: 120, channels: 4, background: "#073B4C" } }).png().toBuffer();
  const theme = { ...dark, logo: { data: logo, width: 400, height: 120 }, icon: { data: logo, width: 400, height: 120 }, footer: ["Estudio SAS · NIT 900.1", "Medellín"] };
  const content = "# Informe\n\n## Resumen\n\nTexto **clave**.\n\n- uno\n- dos\n\n| A | B |\n|---|---|\n| 1 | 2 |";
  for (const ext of ["docx", "pdf", "xlsx", "pptx"]) {
    for (const t of [theme, null]) {
      const built = await buildFile(`informe.${ext}`, content, t);
      assert.ok(built.ok && built.buffer.length > 500, `${ext} ${t ? "con" : "sin"} marca`);
    }
  }
  console.log("verify:company-profile identidad OK");
}

brandChecks().catch((err) => {
  console.error(err);
  process.exit(1);
});
