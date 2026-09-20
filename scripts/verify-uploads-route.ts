import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Prueba la ruta /uploads/[name] en un servidor simulado (<sitio>/hbuilds/versions/<uuid>):
// sirve archivos que están en la carpeta permanente, en la versión actual y en
// versiones ANTERIORES sin copiarlos, y rechaza nombres/tipos peligrosos.
async function main() {
  delete process.env.PERSISTENT_UPLOADS_DIR;
  const site = await realpath(await mkdtemp(path.join(os.tmpdir(), "pmsk-route-")));
  const uploads = (v: string) => path.join(site, "hbuilds", "versions", v, "public", "uploads");
  for (const v of ["v1-viejo", "v2-actual"]) await mkdir(uploads(v), { recursive: true });
  await mkdir(path.join(site, "persistent-uploads"), { recursive: true });
  await writeFile(path.join(uploads("v1-viejo"), "vieja.png"), "IMG-VIEJA");
  await writeFile(path.join(uploads("v2-actual"), "actual.pdf"), "PDF-ACTUAL");
  await writeFile(path.join(site, "persistent-uploads", "perm.jpg"), "IMG-PERM");
  await writeFile(path.join(site, "secreto.txt"), "NO-SALIR");

  const cwd = process.cwd();
  process.chdir(path.join(site, "hbuilds", "versions", "v2-actual"));
  try {
    const { GET } = await import("../src/app/uploads/[name]/route");
    const get = (name: string) => GET(new Request(`http://x/uploads/${name}`), { params: Promise.resolve({ name }) });

    for (const [name, body, type] of [["vieja.png", "IMG-VIEJA", "image/png"], ["actual.pdf", "PDF-ACTUAL", "application/pdf"], ["perm.jpg", "IMG-PERM", "image/jpeg"]]) {
      const res = await get(name);
      assert.equal(res.status, 200, `${name} se sirve`);
      assert.equal(res.headers.get("content-type"), type);
      assert.equal(res.headers.get("content-length"), String(body.length));
      assert.equal(await res.text(), body);
    }
    assert.equal((await get("no-existe.png")).status, 404, "inexistente");
    for (const bad of ["../secreto.txt", "..%2fsecreto.txt", "a/../../secreto.txt", ".env", "x.exe", "x.svg", "..png", "a b.png", "secreto.txt"]) {
      assert.equal((await get(bad)).status, 404, `rechaza ${bad}`);
    }
    console.log("verify-uploads-route: OK");
  } finally {
    process.chdir(cwd);
    await rm(site, { recursive: true, force: true });
  }
}
main().catch((err) => { console.error(err); process.exit(1); });
