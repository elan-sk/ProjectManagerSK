import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { clientDetailFor, clientKey, clientVisibleWhere, deleteClientAs, findOrCreateClient, linkLegacyClients, saveClient, saveClientAs } from "../src/lib/clients";

import { countWebSearches, webSearchTool } from "../src/lib/webSearch";
import { plainError, summarizeGroupedWriteTools } from "../src/lib/chontatecTools";
import { fetchPageText, htmlToText } from "../src/lib/pageTitle";

import { PROJECT_STEPS, TASK_STEPS, projectCoverage, stepMarksFromHistory, stepStates, taskCoverage, taskGaps, clientCoverage, clientGaps, CLIENT_STEPS } from "../src/lib/projectAssistantSteps";
import { similarityScore } from "../src/lib/similarProjects";
import { canUseProjectAssistant, canUseTaskAssistant, hiddenId, taskChannel } from "../src/lib/projectAssistant";
import { managedProjectWhere } from "../src/lib/permissions";

const TAG = `zz-verify-${Date.now()}`;

async function clients() {
  assert.equal(clientKey("  Panacá   Web "), "panaca web");
  assert.equal(clientKey("PANACA web"), clientKey("panacá  web"));
  assert.deepEqual(clientVisibleWhere({ id: "u", role: "ADMIN" }), {});
  // Regla única de PM (2026-11-11): también quien creó el proyecto o el PM de su principal.
  assert.deepEqual(clientVisibleWhere({ id: "u", role: "MEMBER" }), { projects: { some: managedProjectWhere("u") } });

  const pm = await prisma.user.findFirstOrThrow({ where: { active: true }, select: { id: true } });
  const base = { startDate: new Date(), pmId: pm.id };
  const a = await prisma.project.create({ data: { ...base, name: `${TAG} a`, clientName: `${TAG} Clíente` } });
  const b = await prisma.project.create({ data: { ...base, name: `${TAG} b`, clientName: ` ${TAG}  cliente ` } });
  try {
    assert.ok((await linkLegacyClients()) >= 2);
    const [pa, pb] = await Promise.all([a, b].map((p) => prisma.project.findUniqueOrThrow({ where: { id: p.id } })));
    assert.ok(pa.clientId && pa.clientId === pb.clientId, "los dos nombres quedan en un solo cliente");
    assert.equal(pb.clientName, ` ${TAG}  cliente `, "el nombre visible del proyecto no cambia");
    const again = await findOrCreateClient(`${TAG} CLIENTE`, null);
    assert.equal(again?.id, pa.clientId);
    const dup = await saveClient(null, { name: `${TAG} cliente` }, null);
    assert.equal(dup.ok, false);
    const renamed = await saveClient(pa.clientId!, { name: `${TAG} Cliente SAS` }, null);
    assert.ok(renamed.ok);
    assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: b.id } })).clientName, `${TAG} Cliente SAS`);

    const outsider = { id: "nadie-verify", role: "MEMBER" };
    const pmViewer = { id: pm.id, role: "MEMBER" };
    assert.equal((await clientDetailFor(outsider, pa.clientId!)).ok, false, "un miembro sin proyectos no ve la ficha");
    assert.equal((await clientDetailFor(pmViewer, pa.clientId!)).ok, true, "el PM ve la ficha de los clientes de sus proyectos");
    const created = await saveClientAs(outsider, null, { name: `${TAG} otro` });
    assert.equal(created.ok, false, "un miembro común no crea clientes");
    assert.equal((await saveClientAs(pmViewer, pa.clientId!, { profile: "x" })).ok, false, "el PM no edita la ficha");
    assert.equal((await deleteClientAs(pmViewer, pa.clientId!)).ok, false, "el PM no elimina clientes");
  } finally {
    const ids = (await prisma.project.findMany({ where: { name: { startsWith: TAG } }, select: { clientId: true } })).map((p) => p.clientId).filter(Boolean) as string[];
    await prisma.project.deleteMany({ where: { name: { startsWith: TAG } } });
    await prisma.client.deleteMany({ where: { id: { in: ids } } });
  }
}

async function web() {
  assert.equal(webSearchTool("gemini", 0), null, "Gemini no tiene buscador");
  assert.equal(webSearchTool("openai", 0), null);
  assert.equal(webSearchTool("deepseek", 0)?.max_uses, 5);
  assert.equal(webSearchTool("anthropic", 3)?.max_uses, 2);
  assert.equal(webSearchTool("deepseek", 5), null, "tope de 5 por conversación");
  assert.equal(countWebSearches(['[{"type":"server_tool_use","name":"web_search"},{"type":"server_tool_use"}]', "[]"]), 2);
  for (const url of ["http://localhost:3000", "http://127.0.0.1", "http://10.0.0.5", "http://192.168.1.1", "http://169.254.169.254/latest", "file:///etc/passwd"]) {
    const r = await fetchPageText(url);
    assert.equal(r.ok, false, `debe rechazar ${url}`);
  }
  assert.equal(htmlToText("<p>Hola &amp; chao</p><script>x()</script><style>a{}</style><div>Dos</div>"), "Hola & chao\nDos");
}

function confirmBox() {
  const zod = '[{"expected":"string","code":"invalid_type","path":["projectId"]},{"expected":"string","code":"invalid_type","path":["title"]},{"expected":"array","code":"invalid_type","path":["assigneeIds"]}]';
  assert.equal(plainError(zod), "No se pudo: la acción llegó incompleta (falta proyecto, título, responsable). Hay que proponerla de nuevo.");
  assert.equal(plainError("Esa fase no existe."), "Esa fase no existe.");
  const names = new Map([["u1", "Lina"], ["t1", "Diseño del home"]]);
  const text = summarizeGroupedWriteTools(
    [
      { name: "manage_objective", input: { action: "add", title: "Vender en línea" } },
      { name: "manage_objective", input: { action: "add", title: "Ser visibles" } },
      { name: "manage_requirement", input: { action: "add", title: "Catálogo", objectiveTitles: ["Vender en línea"] } },
      { name: "set_project_role", input: { action: "set", userId: "u1", role: "Diseño UI/UX" } },
      { name: "set_task_urgent", input: { taskId: "t1", urgent: true } },
    ],
    names
  );
  assert.match(text, /Objetivos nuevos \(2\)\n• Vender en línea\n• Ser visibles/);
  assert.match(text, /Requerimientos nuevos \(1\)\n• Catálogo → Vender en línea/);
  assert.match(text, /Equipo \(1\)\n• Lina — Diseño UI\/UX/);
  assert.match(text, /urgente.*«Diseño del home»/, "toda acción sobre una tarea dice cuál");
  assert.doesNotMatch(text, /acciones:/);
  const many = summarizeGroupedWriteTools(Array.from({ length: 1000 }, (_, i) => ({ name: "manage_requirement", input: { action: "add", title: `R${i}` } })));
  assert.equal(many.split("\n").length, 12, "título + 10 + «y 990 más»");
  assert.match(many, /^Requerimientos nuevos \(1000\)/);
  assert.match(many, /y 990 más$/);
}

async function steps() {
  assert.equal(hiddenId('Listo, se creó el proyecto "x".<!--ids:projectId=cmw4iord3001kzjtflbxam2mo-->', "projectId"), "cmw4iord3001kzjtflbxam2mo", "el id no arrastra el cierre del comentario");
  assert.equal(hiddenId("<!--ids:taskId=t1,projectId=p2-->", "projectId"), "p2");

  const empty = stepStates(PROJECT_STEPS, projectCoverage(null), stepMarksFromHistory([]));
  assert.equal(empty.total, 8);
  assert.equal(empty.covered, 0);
  assert.equal(empty.items.find((i) => i.current)?.key, "project");

  const facts = { description: "<p>Sitio web</p>", clientId: "c1", targetEndDate: new Date(), roles: 0, objectives: 2, requirements: 0, phaseNames: ["General"], tasks: 0 };
  const covered = projectCoverage(facts);
  assert.deepEqual([...covered].sort(), ["client", "dates", "objectives", "project"]);
  const history = [JSON.stringify([{ type: "tool_use", name: "assistant_step", input: { step: "team", action: "skip" } }])];
  const st = stepStates(PROJECT_STEPS, covered, stepMarksFromHistory(history));
  assert.equal(st.covered, 4);
  assert.equal(st.items.find((i) => i.current)?.key, "requirements", "salta Equipo (saltado) y sigue por el primer pendiente");
  assert.ok(projectCoverage({ ...facts, phaseNames: ["General", "Diseño"] }).has("phases"));

  assert.ok(similarityScore({ clientId: "c1", text: "Sitio web cafetería" }, { clientId: "c1", text: "otro" }) >= 3, "mismo cliente suma");
  assert.ok(similarityScore({ clientId: null, text: "Sitio web tienda virtual" }, { clientId: null, text: "Tienda virtual Panaca" }) >= 2);
  assert.equal(similarityScore({ clientId: null, text: "Sitio web" }, { clientId: null, text: "App móvil" }), 0);

  assert.equal(await canUseProjectAssistant({ id: "nadie-verify", role: "MEMBER" }, null), false, "un miembro común no usa el asistente");

  assert.equal(stepStates(TASK_STEPS, taskCoverage(null), stepMarksFromHistory([])).total, 7);
  const base = { description: "", type: "SIMPLE", requirements: 0, assignees: 1, reviewers: 0, steps: 2, insumos: 0, designItems: 0, tags: 0, projectUsesTags: true };
  const simple = taskCoverage(base);
  assert.ok(simple.has("design"), "en una tarea Simple el paso de pruebas no aplica");
  assert.ok(!simple.has("checklist"), "checklist sin insumos no está completo");
  assert.ok(!taskCoverage({ ...base, type: "QA" }).has("design"), "una Prueba sin pruebas tiene el paso pendiente");
  const gaps = taskGaps(base);
  assert.match(gaps[0], /^Insumos/, "los insumos van primero");
  assert.ok(gaps.some((g) => g.startsWith("Etiquetas")));
  assert.ok(!gaps.some((g) => g.startsWith("Checklist")), "tiene pasos");
  assert.ok(taskGaps({ ...base, type: "QA" }).some((g) => g.startsWith("Revisores")));
  assert.deepEqual(taskGaps({ ...base, description: "<p>x</p>", requirements: 1, insumos: 1, tags: 1 }), []);
  const emptyClient = { logoUrl: null, contactName: null, contactEmail: null, contactPhone: "313", website: null, profile: null };
  assert.match(clientGaps(emptyClient)[0], /^Perfil/);
  assert.ok(!clientGaps(emptyClient).some((g) => g.startsWith("Correo")), "con teléfono no falta el medio de contacto");
  assert.equal(stepStates(CLIENT_STEPS, clientCoverage(emptyClient), stepMarksFromHistory([])).items.find((i) => i.current)?.key, "business");
  assert.equal(taskChannel("p1", null), "task:new:p1");
  assert.equal(taskChannel("p1", "t1"), "task:t1");
  const anyProject = await prisma.project.findFirst({ select: { id: true } });
  if (anyProject) {
    assert.equal(await canUseTaskAssistant({ id: "nadie-verify", role: "MEMBER" }, anyProject.id, null), false, "un miembro común no usa el asistente de tareas");
    assert.equal(await canUseTaskAssistant({ id: "nadie-verify", role: "ADMIN" }, anyProject.id, "tarea-de-otro-proyecto"), false, "la tarea tiene que ser del proyecto");
  }
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN", active: true }, select: { id: true, role: true } });
  if (admin) assert.equal(await canUseProjectAssistant(admin, null), true);
}

async function main() {
  await clients();
  await web();
  await steps();
  confirmBox();
  console.log("verify:project-assistant ok");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
