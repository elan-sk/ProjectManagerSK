#!/usr/bin/env node
// Alternativa a lens-sk-project-map.js para proyectos React/Next.js (o
// cualquier stack con JSX). El generador original mapea "clase CSS ->
// archivo:línea" — funciona bien en WordPress/PHP con clases semánticas
// únicas por componente (BEM), pero en un proyecto React+Tailwind casi
// todas las clases son utilidades repetidas por toda la app (flex, border,
// rounded-lg...) que no identifican ningún componente en particular.
//
// Acá la llave estable es el NOMBRE DEL COMPONENTE (ej. "GanttView",
// "KanbanBoard") — React lo expone siempre en el fiber (node.type.name),
// intacto en dev incluso sin _debugSource/_debugStack (que en React 19 ya
// no dan línea útil desde el browser sin decodificar el source map, ver
// reactComponentNameFor() en toolbar.js). El navegador resuelve por clase
// primero (compat con el mapa viejo) y cae acá si no encuentra nada — así
// un mismo componentMap sirve para los dos mundos sin necesidad de
// detectar el stack del proyecto.
//
// Atajo, no verdad absoluta (mismo espíritu que lens-sk-project-map.js):
// regex sobre el texto fuente, no un parser de verdad. Resuelve al archivo
// y a la línea de la DECLARACIÓN del componente (no a la línea exacta del
// elemento clickeado adentro de él) — ver el comentario sobre rootNode:null
// en resolveElementLine() de toolbar.js.
//
// Uso:
//   node lens-sk-react-component-map.js            -> escanea src/ y genera una vez
//   node lens-sk-react-component-map.js --watch     -> regenera en cada guardado
//   node lens-sk-react-component-map.js --dirs=src,app  -> carpetas propias
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, '.lens-sk-cache');
const OUT_JSON = path.join(OUT_DIR, 'project-map.json');
const EXTENSIONS = ['.tsx', '.jsx'];

const dirsArg = process.argv.find((a) => a.startsWith('--dirs='));
const SCAN_DIRS = dirsArg ? dirsArg.slice('--dirs='.length).split(',').filter(Boolean) : ['src', 'app'];

function collectFiles() {
  const out = [];
  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (EXTENSIONS.includes(path.extname(entry.name))) out.push(full);
    }
  }
  SCAN_DIRS.forEach((d) => walk(path.join(ROOT, d)));
  return out;
}

// "export function Nombre(" / "export default function Nombre(" /
// "export const Nombre = (" / "export const Nombre: Tipo = (" — las formas
// reales que cubren function components y arrow components. PascalCase a
// propósito (convención de componente de React) — descarta hooks/helpers
// en minúscula, que no son lo que resuelve un click en el DOM.
const COMPONENT_DECL = /export\s+(?:default\s+)?function\s+([A-Z][A-Za-z0-9_]*)\s*[(<]|export\s+const\s+([A-Z][A-Za-z0-9_]*)\s*[:=]/;

// Tag JSX de apertura en minúscula = elemento HTML real (a diferencia de un
// componente propio en PascalCase, que no aparece tal cual en el DOM final
// y por lo tanto no aporta nada al índice posicional de abajo).
const JSX_TAG_OPEN = /<([a-z][a-zA-Z0-9]*)\b/;

function scanFile(absPath) {
  const rel = path.relative(ROOT, absPath).split(path.sep).join('/');
  const text = fs.readFileSync(absPath, 'utf8');
  const lines = text.split('\n');
  const componentEntries = [];
  const tagLines = {};
  let openTag = null; // último <tag visto sin su '>' de cierre todavía (heurística por línea, no AST)

  lines.forEach((lineText, idx) => {
    const lineNo = idx + 1;
    const declMatch = lineText.match(COMPONENT_DECL);
    if (declMatch) {
      const name = declMatch[1] || declMatch[2];
      if (name) componentEntries.push({ name, line: lineNo });
    }
    const tagMatch = lineText.match(JSX_TAG_OPEN);
    if (tagMatch) {
      openTag = { tag: tagMatch[1], line: lineNo };
      if (!tagLines[openTag.tag]) tagLines[openTag.tag] = [];
      tagLines[openTag.tag].push(lineNo);
    }
    if (openTag && />/.test(lineText)) openTag = null;
  });

  return { rel, componentEntries, tagLines };
}

function buildMap() {
  const componentMap = {};
  const elementIndex = {};
  collectFiles().forEach((absPath) => {
    const { rel, componentEntries, tagLines } = scanFile(absPath);
    if (Object.keys(tagLines).length) elementIndex[rel] = tagLines;
    componentEntries.forEach(({ name, line }) => {
      // El primer archivo que declara ese nombre gana — dos componentes con
      // el mismo nombre en archivos distintos no debería pasar en un
      // proyecto React sano; si pasa, el segundo simplemente no se indexa.
      if (!componentMap[name]) componentMap[name] = { file: rel, line };
    });
  });
  return {
    generatedAt: new Date().toISOString(),
    themeRoot: ROOT,
    componentMap,
    elementIndex,
    files: {},
    byClass: {},
    customUtilities: {},
    colorTokens: {},
  };
}

function writeMap() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const map = buildMap();
  fs.writeFileSync(OUT_JSON, JSON.stringify(map, null, 2));
  const componentCount = Object.keys(map.componentMap).length;
  const fileCount = Object.keys(map.elementIndex).length;
  console.log(`[lens-sk-react-component-map] ${componentCount} componente(s), ${fileCount} archivo(s) con índice -> .lens-sk-cache/project-map.json`);
}

function runWatch() {
  writeMap();
  let timer = null;
  const trigger = () => {
    clearTimeout(timer);
    timer = setTimeout(writeMap, 300);
  };
  SCAN_DIRS.forEach((d) => {
    const full = path.join(ROOT, d);
    if (!fs.existsSync(full)) return;
    fs.watch(full, { recursive: true }, (_event, filename) => {
      if (filename && !EXTENSIONS.includes(path.extname(filename))) return;
      trigger();
    });
  });
}

if (process.argv.includes('--watch')) {
  runWatch();
} else {
  writeMap();
}
