import assert from "node:assert/strict";
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ensurePersistentUploads } from "../src/lib/persistentUploads";

// Simula el servidor de Hostinger en una carpeta temporal: <sitio>/hbuilds/versions/<uuid>
// (una carpeta por deploy) y comprueba que las imágenes de versiones anteriores
// reaparecen en la nueva SIN moverlas ni borrarlas de donde estaban.
async function main() {
  delete process.env.PERSISTENT_UPLOADS_DIR;
  const site = await mkdtemp(path.join(os.tmpdir(), "pmsk-site-"));
  const version = async (id: string, files: Record<string, string> = {}) => {
    const dir = path.join(site, "hbuilds", "versions", id);
    await mkdir(path.join(dir, "public", "uploads"), { recursive: true });
    await writeFile(path.join(dir, "public", "uploads", ".gitkeep"), "");
    for (const [name, body] of Object.entries(files)) await writeFile(path.join(dir, "public", "uploads", name), body);
    return dir;
  };
  const persistent = path.join(site, "public_html", "uploads");
  const read = (p: string) => readFile(p, "utf8");

  try {
    // Deploys viejos, cada uno con lo que se subió mientras estuvo activo (sin carpeta permanente).
    const v1 = await version("v1-viejo", { "a.png": "A", "b.pdf": "B" });
    const v2 = await version("v2-viejo", { "c.png": "C" });

    // Deploy NUEVO (vacío) arranca con esta versión del código.
    const v3 = await version("v3-nuevo");
    await ensurePersistentUploads(v3);

    assert.equal((await lstat(path.join(v3, "public/uploads"))).isSymbolicLink(), true, "uploads pasa a ser un enlace");
    assert.equal(await realpath(path.join(v3, "public/uploads")), await realpath(persistent), "apunta a <sitio>/public_html/uploads");
    for (const [n, body] of [["a.png", "A"], ["b.pdf", "B"], ["c.png", "C"]]) {
      assert.equal(await read(path.join(v3, "public/uploads", n)), body, `${n} se ve desde la versión nueva`);
    }
    // "como estaban, donde estaban": los originales siguen intactos
    assert.equal(await read(path.join(v1, "public/uploads/a.png")), "A");
    assert.equal(await read(path.join(v2, "public/uploads/c.png")), "C");

    // Arrancar otra vez es inocuo (idempotente) y no duplica ni falla
    await ensurePersistentUploads(v3);
    assert.deepEqual((await readdir(persistent)).sort(), ["a.png", "b.pdf", "c.png"]);

    // Se sube algo nuevo desde la versión v3; el próximo deploy (v4, vacío) lo ve junto a lo viejo.
    await writeFile(path.join(v3, "public/uploads/d.png"), "D");
    const v4 = await version("v4-nuevo");
    await ensurePersistentUploads(v4);
    for (const n of ["a.png", "b.pdf", "c.png", "d.png"]) assert.ok((await readdir(path.join(v4, "public/uploads"))).includes(n), `${n} sobrevive al siguiente deploy`);

    // No pisa un archivo que ya existe en la carpeta permanente
    await writeFile(path.join(v1, "public/uploads/d.png"), "VIEJO");
    await ensurePersistentUploads(v4);
    assert.equal(await read(path.join(persistent, "d.png")), "D", "no sobrescribe");

    // Fuera de Hostinger (dev local) y sin variable: no hace nada
    const local = await mkdtemp(path.join(os.tmpdir(), "pmsk-local-"));
    await mkdir(path.join(local, "public/uploads"), { recursive: true });
    await ensurePersistentUploads(local);
    assert.equal((await lstat(path.join(local, "public/uploads"))).isSymbolicLink(), false, "dev local queda igual");
    await rm(local, { recursive: true, force: true });

    // PERSISTENT_UPLOADS_DIR manda sobre la detección automática
    const custom = path.join(site, "otra-carpeta");
    process.env.PERSISTENT_UPLOADS_DIR = custom;
    const v5 = await version("v5-nuevo");
    await ensurePersistentUploads(v5);
    assert.equal(await realpath(path.join(v5, "public/uploads")), await realpath(custom), "la variable tiene prioridad");
    assert.equal(await read(path.join(custom, "a.png")), "A", "y también recupera lo de versiones anteriores");

    // Carpeta anterior <sitio>/persistent-uploads: sus archivos también se recuperan
    delete process.env.PERSISTENT_UPLOADS_DIR;
    const s2 = await mkdtemp(path.join(os.tmpdir(), "pmsk-site2-"));
    const hv = path.join(s2, "hbuilds", "versions", "v1");
    await mkdir(path.join(hv, "public/uploads"), { recursive: true });
    await mkdir(path.join(s2, "persistent-uploads"), { recursive: true });
    await writeFile(path.join(s2, "persistent-uploads", "viejo.png"), "V");
    await ensurePersistentUploads(hv);
    assert.equal(await read(path.join(s2, "public_html", "uploads", "viejo.png")), "V", "recupera la carpeta anterior");
    await rm(s2, { recursive: true, force: true });

    console.log("verify-persistent-uploads: OK");
  } finally {
    await rm(site, { recursive: true, force: true });
  }
}
main().catch((err) => { console.error(err); process.exit(1); });
