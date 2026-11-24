/**
 * Read-only probe: dsh-tools (workspace, devDeps 0.2.0-rc.2) vs installed host 0.2.3-alpha.2.
 * Checks: (a) used deep-import symbols survive, (b) export-table drift,
 * (c) tools.register/defineTool contract, (d) Session format version.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const WS = "E:\\Deepseek\\PluginDevelop\\node_modules\\@deepseek-ai";
const HOST = "E:\\npm-global\\node_modules\\@deepseek-ai\\dsh\\node_modules\\@deepseek-ai";

const USED = {
  "dsh-agent": ["installModelSelection"],
  "dsh-llm": ["createUserMessage"],
  "dsh-session": ["SessionId", "SESSION_FORMAT_VERSION"],
  "dsh-tools": ["defineTool", "validateArgs", "assertSupportedJsonSchema"],
};

async function info(core, pkg) {
  const dir = join(core, pkg);
  if (!existsSync(dir)) return { missing: true };
  const pj = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const entry = join(dir, "lib", "index.js");
  if (!existsSync(entry)) return { version: pj.version, noEntry: true, exportsMap: pj.exports };
  const mod = await import(pathToFileURL(entry).href);
  return { version: pj.version, keys: Object.keys(mod), mod };
}

let failures = 0;
for (const pkg of Object.keys(USED)) {
  const ws = await info(WS, pkg);
  const host = await info(HOST, pkg);
  console.log("=".repeat(70));
  console.log(`${pkg}:  workspace=${ws.version}  host=${host.version}`);
  const wsSet = new Set(ws.keys ?? []);
  const hostSet = new Set(host.keys ?? []);
  const removed = [...wsSet].filter((k) => !hostSet.has(k));
  const added = [...hostSet].filter((k) => !wsSet.has(k));
  console.log(`  exports: ${wsSet.size} -> ${hostSet.size}`);
  console.log(`  REMOVED in host: ${removed.join(", ") || "(none)"}`);
  console.log(`  added in host: ${added.join(", ") || "(none)"}`);
  for (const sym of USED[pkg]) {
    const a = wsSet.has(sym);
    const b = hostSet.has(sym);
    console.log(`  used ${sym}: workspace=${a ? "OK" : "MISSING"} host=${b ? "OK" : "MISSING"}`);
    if (!b) failures++;
  }
  if (pkg === "dsh-session") {
    console.log(`  SESSION_FORMAT_VERSION: workspace=${ws.mod?.SESSION_FORMAT_VERSION} host=${host.mod?.SESSION_FORMAT_VERSION}`);
  }
  if (pkg === "dsh-agent") {
    const ev = Object.keys(host.mod ?? {}).filter((k) => /event|status|stream/i.test(k));
    console.log(`  host agent event-ish exports: ${ev.join(", ") || "(none)"}`);
  }
}

// tools contract: drive the host primitives exactly as tools.register() does.
console.log("=".repeat(70));
console.log("tools contract on host 0.2.3-alpha.2");
const hostTools = await info(HOST, "dsh-tools");
const { defineTool, validateArgs, assertSupportedJsonSchema } = hostTools.mod;
const def = defineTool({
  name: "generate_image",
  description: "probe",
  parameters: { prompt: { type: "string", required: true, description: "p" } },
  output: { schema: { type: "string" }, render: (_a, v) => [{ type: "text", text: `ok ${v}` }] },
  async execute(args) { return args.prompt; },
});
const ok = (label, cond, extra = "") => {
  console.log(`  ${cond ? "ok  " : "FAIL"} ${label}${extra ? " — " + extra : ""}`);
  if (!cond) failures++;
};
ok("defineTool produces output{render}", typeof def.output?.render === "function");
let schemaErr = null;
try { assertSupportedJsonSchema(def.output.schema); } catch (e) { schemaErr = e.message; }
ok("output.schema supported", schemaErr === null, schemaErr ?? "");
ok("compact parameters accepted", Array.isArray(validateArgs({ prompt: { type: "string", required: true, description: "p" } }, { prompt: "x" })));
ok("missing arg rejected", validateArgs({ prompt: { type: "string", required: true, description: "p" } }, {}).length > 0);

console.log(`\n${failures === 0 ? "PROBE OK" : `PROBE FAILURES: ${failures}`}`);
process.exit(failures === 0 ? 0 : 1);
