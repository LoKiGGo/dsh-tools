/**
 * dsh-tools — harness.check 版本检查冒烟测试。
 *
 * 覆盖：
 *   - readHarnessVersionFromPackage 读取 package.json；
 *   - discoverHarnessVersion 优先读取 DSH_TOOLS_HARNESS_VERSION 测试覆盖；
 *   - checkHarnessVersion 在打桩 GitHub API 下返回 current/latest/outdated；
 *   - GitHub API 失败时返回 error 且不误报 outdated。
 *
 * Run:  node test/harness-check-smoke.mjs
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { readHarnessVersionFromPackage, readHarnessVersionFromArgv, discoverHarnessVersion, checkHarnessVersion } = await import("../lib/features/harness-check.js");

let failures = 0;
function assert(cond, msg) {
	if (!cond) {
		failures += 1;
		console.error("FAIL:", msg);
	} else {
		console.log("ok:", msg);
	}
}

const tmp = mkdtempSync(join(tmpdir(), "dsh-tools-harness-smoke-"));
const pkgPath = join(tmp, "package.json");
writeFileSync(pkgPath, JSON.stringify({ name: "@deepseek-ai/dsh", version: "0.1.0-rc.7" }, null, 2));
assert(readHarnessVersionFromPackage(pkgPath) === "0.1.0-rc.7", "readHarnessVersionFromPackage reads version");
assert(readHarnessVersionFromPackage(join(tmp, "missing.json")) === null, "missing package returns null");
const pkgRoot = join(tmp, "pkg");
mkdirSync(join(pkgRoot, "lib"), { recursive: true });
writeFileSync(join(pkgRoot, "package.json"), JSON.stringify({ name: "@deepseek-ai/dsh", version: "0.1.0-rc.7" }, null, 2));
assert(readHarnessVersionFromArgv([ "node", join(pkgRoot, "lib", "bin.js") ]) === "0.1.0-rc.7", "readHarnessVersionFromArgv derives version from dsh CLI script path");

const realFetch = globalThis.fetch;
const realEnv = process.env.DSH_TOOLS_HARNESS_VERSION;
process.env.DSH_TOOLS_HARNESS_VERSION = "0.1.0-rc.7";
assert(discoverHarnessVersion() === "0.1.0-rc.7", "discoverHarnessVersion honors test override");

globalThis.fetch = async (url) => {
	const path = new URL(String(url)).pathname;
	if (path.endsWith("/releases/latest")) {
		return { ok: true, status: 200, json: async () => ({ tag_name: "v0.1.0-rc.8" }) };
	}
	return { ok: false, status: 404, json: async () => ({}) };
};

let result = await checkHarnessVersion();
assert(result.current === "0.1.0-rc.7", "current version reported");
assert(result.latest === "0.1.0-rc.8", "latest version from GitHub release");
assert(result.outdated === true, "rc.7 < rc.8 → outdated");
assert(result.error === "", "no error on success");

globalThis.fetch = async () => { throw new Error("ECONNREFUSED"); };
result = await checkHarnessVersion();
assert(result.error !== "" && /GitHub API 请求失败/.test(result.error), "network failure surfaces as error");
assert(result.outdated === false, "no outdated flag when probe fails");

globalThis.fetch = realFetch;
if (realEnv === undefined) delete process.env.DSH_TOOLS_HARNESS_VERSION;
else process.env.DSH_TOOLS_HARNESS_VERSION = realEnv;
rmSync(tmp, { recursive: true, force: true });

if (failures > 0) {
	console.error(`\nHARNESS-CHECK-SMOKE FAILED: ${failures} assertion(s)`);
	process.exit(1);
}
console.log("\nHARNESS-CHECK-SMOKE OK: all assertions passed");
