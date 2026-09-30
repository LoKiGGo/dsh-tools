/**
 * Read-only: walk the plugin's real ESM import graph from lib/index.js and
 * report (a) which vendor files are reachable, and (b) every bare
 * @deepseek-ai/* specifier with whether Node can resolve it from the plugin.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";
import { createRequire } from "node:module";

const ROOT = "E:\\Deepseek\\PluginDevelop";
const ENTRY = resolve(ROOT, "lib/index.js");
const req = createRequire(ENTRY);

const IMPORT_RE = /(?:^|[^\w.])(?:import|export)\s[^'"();]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|(?:^|[^\w.])import\s*["']([^"']+)["']/g;

const visited = new Set();
const bare = new Map(); // specifier -> Set(importers)
const files = [];

function resolveSpec(spec, fromFile) {
  if (!spec.startsWith(".")) return null;
  const base = resolve(dirname(fromFile), spec);
  for (const cand of [base, `${base}.js`, resolve(base, "index.js")]) {
    if (existsSync(cand) && !cand.endsWith("\\")) {
      try { if (readFileSync(cand)) return cand; } catch {}
    }
  }
  return null;
}

function walk(file) {
  if (visited.has(file)) return;
  visited.add(file);
  files.push(file);
  let text;
  try { text = readFileSync(file, "utf8"); } catch { return; }
  for (const m of text.matchAll(IMPORT_RE)) {
    const spec = m[1] ?? m[2] ?? m[3];
    if (!spec) continue;
    if (spec.startsWith(".")) {
      const next = resolveSpec(spec, file);
      if (next) walk(next);
      else console.log(`  UNRESOLVED-RELATIVE  ${spec}  (from ${relative(ROOT, file)})`);
    } else {
      if (!bare.has(spec)) bare.set(spec, new Set());
      bare.get(spec).add(relative(ROOT, file));
    }
  }
}

walk(ENTRY);

console.log(`reachable files from lib/index.js: ${files.length}`);
console.log("");
console.log("=== reachable vendor/wechat files ===");
for (const f of files.map((f) => relative(ROOT, f)).filter((f) => f.startsWith("lib\\wechat")).sort()) {
  console.log("  " + f);
}

console.log("");
console.log("=== bare specifiers + resolution from plugin ===");
for (const [spec, importers] of [...bare.entries()].sort()) {
  let verdict = "OK";
  let detail = "";
  try {
    const pj = req.resolve(`${spec}/package.json`);
    detail = JSON.parse(readFileSync(pj, "utf8")).version;
  } catch {
    try {
      const resolved = req.resolve(spec);
      detail = resolved;
    } catch (e) {
      verdict = "UNRESOLVABLE";
      detail = e.code ?? e.message;
    }
  }
  console.log(`  ${verdict.padEnd(13)} ${spec.padEnd(34)} ${detail}`);
  for (const i of importers) console.log(`                  <- ${i}`);
}

console.log("");
console.log("=== vendor/weixin files on disk, reachability ===");
const { readdirSync, statSync } = await import("node:fs");
function allFiles(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = resolve(dir, e.name);
    if (e.isDirectory()) out.push(...allFiles(p));
    else if (e.name.endsWith(".js")) out.push(p);
  }
  return out;
}
for (const f of allFiles(resolve(ROOT, "lib/wechat/vendor"))) {
  const rel = relative(ROOT, f);
  console.log(`  ${visited.has(f) ? "REACHABLE  " : "unreachable"}  ${rel}`);
}
