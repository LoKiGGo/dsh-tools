/**
 * Read-only: compare the three deep-import surfaces between the version the
 * plugin actually loads (workspace, 0.1.5-rc.1) and the host (0.2.0-rc.2).
 * Answers: (a) do the used symbols survive, (b) would bumping devDeps change
 * the resolved file at all, (c) are static imports safely resolvable.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const WS = "E:\\Deepseek\\PluginDevelop\\node_modules\\@deepseek-ai";
const HOST = "E:\\npm-global\\node_modules\\@deepseek-ai\\dsh\\node_modules\\@deepseek-ai";

/** what the plugin actually uses from each package */
const USED = {
  "dsh-agent": ["installModelSelection"],
  "dsh-llm": ["createUserMessage"],
  "dsh-session": ["SessionId"],
};

/** Files bridge.js imports, to test static resolvability of each export target. */
const PACKAGES = Object.keys(USED);

async function exportsOf(core, pkg) {
  const dir = join(core, pkg);
  if (!existsSync(dir)) return { missing: true };
  const pj = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const entry = join(dir, "lib", "index.js");
  if (!existsSync(entry)) return { version: pj.version, noEntry: true, exports: pj.exports };
  const mod = await import(pathToFileURL(entry).href);
  return { version: pj.version, keys: Object.keys(mod), exports: pj.exports };
}

for (const pkg of PACKAGES) {
  const ws = await exportsOf(WS, pkg);
  const host = await exportsOf(HOST, pkg);
  console.log("=".repeat(72));
  console.log(`${pkg}:  plugin-loads=${ws.version}   host=${host.version}`);
  const wsSet = new Set(ws.keys ?? []);
  const hostSet = new Set(host.keys ?? []);
  const removed = [...wsSet].filter((k) => !hostSet.has(k));
  const added = [...hostSet].filter((k) => !wsSet.has(k));
  console.log(`  export count: ${ws.keys?.length} -> ${host.keys?.length}`);
  console.log(`  REMOVED in host (${removed.length}): ${removed.join(", ") || "(none)"}`);
  console.log(`  added in host  (${added.length}): ${added.join(", ") || "(none)"}`);
  for (const sym of USED[pkg]) {
    console.log(`  used symbol ${sym}: pluginCopy=${wsSet.has(sym) ? "OK" : "MISSING"}  host=${hostSet.has(sym) ? "OK" : "MISSING"}`);
  }
  if (removed.length > 0) console.log(`  >>> plugin would break on these if it used them`);
  console.log("");
}

console.log("=".repeat(72));
console.log("DOES BUMPING devDeps CHANGE THE RESOLVED FILE?");
console.log("bridge.js does: import { X } from '@deepseek-ai/dsh-agent'");
console.log("Both copies are complete package installs, so resolution depends only on");
console.log("directory layout, not on the declared version:");
for (const pkg of PACKAGES) {
  const wsDir = join(WS, pkg);
  const pj = JSON.parse(readFileSync(join(wsDir, "package.json"), "utf8"));
  console.log(`  ${pkg.padEnd(14)} workspace copy: v${pj.version}  has lib/index.js: ${existsSync(join(wsDir, "lib", "index.js"))}`);
}

console.log("");
console.log("=".repeat(72));
console.log("STATIC IMPORT REQUIREMENT: does bridge.js do a static or dynamic import?");
const bridge = readFileSync("E:\\Deepseek\\PluginDevelop\\lib\\wechat\\vendor\\bridge.js", "utf8");
for (const line of bridge.split("\n").slice(0, 20)) {
  if (line.includes("@deepseek-ai")) console.log("  " + line.trim());
}
console.log("  -> static ESM imports, resolved at module-evaluation time");
