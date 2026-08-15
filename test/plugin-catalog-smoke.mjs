/**
 * dsh-tools — plugin-catalog 分类判定纯函数 smoke test (Node, no server).
 *
 * 直接断言 lib/features/plugin-catalog.js 的纯函数：
 *   - isLocalSpec：link:/file:/绝对路径/UNC 判定；
 *   - classifyModule：scope 规则、依赖 spec 规则、余量桶（解析探测）规则；
 *   - probeInstalledPath：profile node_modules 内手工放置的包；
 *   - readProfileDeps：manifest 缺失/畸形回退；
 *   - catalogSnapshot：loader 投影（跳过 group、相位映射、spec 携带）。
 *
 * 全部在临时 DSH_HOME 下运行，绝不触碰真实 profile。
 *
 * Run:  node test/plugin-catalog-smoke.mjs
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	catalogSnapshot,
	classifyModule,
	isLocalSpec,
	probeInstalledPath,
	readProfileDeps,
} from "../lib/features/plugin-catalog.js";

const tmp = mkdtempSync(join(tmpdir(), "dsh-tools-catalog-"));
process.env.DSH_HOME = tmp;

let failures = 0;
function assert(cond, msg) {
	if (!cond) {
		failures += 1;
		console.error("FAIL:", msg);
	} else {
		console.log("ok:", msg);
	}
}

// --- isLocalSpec ---

assert(isLocalSpec("link:E:/dev/dsh-tools"), "link: spec is local");
assert(isLocalSpec("file:../plugins/x"), "file: spec is local");
assert(isLocalSpec("C:\\dev\\my-plugin"), "absolute windows path is local");
assert(isLocalSpec("\\\\server\\share\\plugin"), "UNC path is local");
assert(!isLocalSpec("^1.4.1"), "semver spec is not local");
assert(!isLocalSpec("github:someone/dsh-skill-viewer"), "github: spec is not local");
assert(!isLocalSpec("https://example.com/x.tgz"), "URL spec is not local");

// --- classifyModule ---

const deps = {
	"dsh-tools": "link:E:/dev/dsh-tools",
	"dshmarket": "^1.4.1",
	"dsh-skill-viewer": "github:someone/dsh-skill-viewer#v0.3.1",
	"dsh-better-sidebar": "file:../better-sidebar",
};
assert(classifyModule("", deps) === "local", "empty name classifies local");
assert(classifyModule(undefined, deps) === "local", "missing name classifies local");
assert(classifyModule("@deepseek-ai/dsh-base", deps) === "official", "official scope wins over deps");
assert(classifyModule("dsh-tools", deps) === "local", "link: spec classifies local");
assert(classifyModule("dsh-better-sidebar", deps) === "local", "file: spec classifies local");
assert(classifyModule("dshmarket", deps) === "installed", "semver spec classifies installed");
assert(classifyModule("dsh-skill-viewer", deps) === "installed", "github: spec classifies installed");
assert(classifyModule("cordis", deps) === "official", "name absent from deps classifies official (harness transitive)");
assert(classifyModule("cordis", null) === "official", "null deps still classifies official");

// --- probeInstalledPath + 余量桶 ---

const profile = join(tmp, "profiles", "web");
mkdirSync(join(profile, "node_modules", "my-handmade-plugin"), { recursive: true });
writeFileSync(join(profile, "package.json"), JSON.stringify({ name: "fake-profile", dependencies: {} }, null, 2) + "\n");
writeFileSync(join(profile, "node_modules", "my-handmade-plugin", "package.json"), JSON.stringify({ name: "my-handmade-plugin", version: "1.0.0", main: "index.js" }, null, 2) + "\n");
writeFileSync(join(profile, "node_modules", "my-handmade-plugin", "index.js"), "module.exports = {};\n");
assert(probeInstalledPath("my-handmade-plugin", profile) !== null, "package inside profile node_modules probes installed");
assert(probeInstalledPath("definitely-not-installed", profile) === null, "unresolvable name probes null");
assert(classifyModule("my-handmade-plugin", {}, profile) === "installed", "hand-placed package in profile node_modules classifies installed");

// --- readProfileDeps ---

assert(readProfileDeps(profile)["my-handmade-plugin"] === undefined, "deps read from manifest (fake has none)");
assert(Object.keys(readProfileDeps(join(tmp, "no-such-dir"))).length === 0, "missing manifest reads empty deps");

// --- catalogSnapshot ---

const fakeLoader = {
	entries: () => [
		{ id: "a", options: { name: "@deepseek-ai/dsh-base" }, disabled: false, fiber: { state: 2 } },
		{ id: "b", options: { name: "dshmarket" }, disabled: false, fiber: { state: 3 } },
		{ id: "c", options: { name: "dsh-tools" }, disabled: true, fiber: { state: 4 } },
		{ id: "d", options: { name: "cordis" }, disabled: false, fiber: undefined },
		{ id: "e", options: { group: true, name: "@deepseek-ai/dsh-base" }, disabled: false, fiber: { state: 2 } },
	],
};
const snap = catalogSnapshot(fakeLoader, { "dsh-tools": "link:E:/x", "dshmarket": "^1.4.1" }, profile);
assert(snap.entries.length === 4, "group entries skipped");
const byId = Object.fromEntries(snap.entries.map((e) => [e.entryId, e]));
assert(byId.a.category === "official" && byId.a.fiberPhase === "active" && byId.a.enabled === true, "official active entry projected");
assert(byId.b.category === "installed" && byId.b.fiberPhase === "failed", "installed failed entry projected");
assert(byId.c.category === "local" && byId.c.enabled === false && byId.c.fiberPhase === null, "local disabled entry projected, disposed fiber maps null");
assert(byId.d.category === "official" && byId.d.fiberPhase === null, "unobserved fiber maps null");
assert(byId.c.spec === "link:E:/x" && byId.a.spec === null, "spec carried only for declared deps");

// cleanup
rmSync(tmp, { recursive: true, force: true });

if (failures > 0) {
	console.error(`\nPLUGIN-CATALOG SMOKE FAILED: ${failures} assertion(s)`);
	process.exit(1);
}
console.log("\nPLUGIN-CATALOG SMOKE OK: all assertions passed");
