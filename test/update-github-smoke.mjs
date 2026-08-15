/**
 * dsh-tools — update-plugin GitHub 支持冒烟测试。
 *
 * 覆盖路线 B（github:/URL 安装插件的更新检测）：
 *   - 纯函数：classifySpec / parseGitHubSpec / versionFromTag / buildUpdateSpec;
 *   - check 全流程：fake DSH_HOME profile（github: spec 依赖 + 假包），
 *     打桩全局 fetch 返回 GitHub Releases 响应 → skip=false、latest 解析、
 *     outdated 判定; 404 时回退 tags 列表; 全失败时 error 展示。
 *
 * Run:  node test/update-github-smoke.mjs
 */

import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "dsh-tools-gh-smoke-"));
process.env.DSH_HOME = tmp;

const { classifySpec, parseGitHubSpec, versionFromTag, buildUpdateSpec, githubLatestTag } = await import("../lib/features/update-plugin.js");

let failures = 0;
function assert(cond, msg) {
	if (!cond) {
		failures += 1;
		console.error("FAIL:", msg);
	} else {
		console.log("ok:", msg);
	}
}

// --- pure helpers ---

assert(classifySpec("^0.3.1") === "registry", "registry spec classified");
assert(classifySpec("dsh-skill-viewer") === "registry", "bare name classified as registry");
assert(classifySpec("github:someone/dsh-skill-viewer") === "github", "github: spec classified");
assert(classifySpec("https://github.com/someone/dsh-skill-viewer/releases/download/v0.3.1/dsh-skill-viewer-0.3.1.tgz") === "github", "github.com URL classified");
assert(classifySpec("https://github.com/someone/dsh-skill-viewer/archive/refs/tags/v0.3.1.tar.gz") === "github", "archive URL classified");
assert(classifySpec("link:E:/x") === "skip", "link: spec skipped");
assert(classifySpec("file:../x") === "skip", "file: spec skipped");
assert(classifySpec("workspace:*") === "skip", "workspace: spec skipped");
assert(classifySpec("git+https://github.com/u/r.git") === "skip", "git+ spec skipped");
assert(classifySpec("https://example.com/x.tgz") === "skip", "non-github URL skipped");

const ref1 = parseGitHubSpec("github:someone/dsh-skill-viewer");
assert(ref1 !== null && ref1.owner === "someone" && ref1.repo === "dsh-skill-viewer" && ref1.tag === undefined, "github: spec parsed (owner/repo)");
const ref2 = parseGitHubSpec("github:someone/dsh-skill-viewer#v0.2.2");
assert(ref2 !== null && ref2.tag === "v0.2.2", "github: spec parsed with #tag");
const ref3 = parseGitHubSpec("https://github.com/someone/dsh-skill-viewer/releases/download/v0.3.1/dsh-skill-viewer-0.3.1.tgz");
assert(ref3 !== null && ref3.owner === "someone" && ref3.repo === "dsh-skill-viewer" && ref3.tag === "v0.3.1", "release download URL parsed with tag");
const ref4 = parseGitHubSpec("https://github.com/someone/dsh-skill-viewer");
assert(ref4 !== null && ref4.tag === undefined, "bare repo URL parsed without tag");
assert(parseGitHubSpec("link:E:/x") === null, "non-github spec returns null");

assert(versionFromTag("v0.3.1") === "0.3.1", "versionFromTag strips v prefix");
assert(versionFromTag("release-0.3.1") === "0.3.1", "versionFromTag strips release- prefix");
assert(versionFromTag("0.3.1") === "0.3.1", "versionFromTag passes plain versions");

assert(buildUpdateSpec("github:someone/dsh-skill-viewer", "v0.3.1") === "github:someone/dsh-skill-viewer#v0.3.1", "github: spec pins #tag");
assert(buildUpdateSpec("https://github.com/someone/dsh-skill-viewer/releases/download/v0.2.2/x.tgz", "v0.3.1") === "https://github.com/someone/dsh-skill-viewer/archive/refs/tags/v0.3.1.tar.gz", "URL spec becomes archive tarball");

// --- githubLatestTag against a stubbed fetch ---

const realFetch = globalThis.fetch;
const fetchCalls = [];
globalThis.fetch = async (url, opts) => {
	fetchCalls.push(String(url));
	const path = new URL(String(url)).pathname;
	if (path.endsWith("/releases/latest")) {
		return { ok: true, status: 200, json: async () => ({ tag_name: "v0.3.1" }) };
	}
	if (path.endsWith("/tags")) {
		return { ok: true, status: 200, json: async () => [{ name: "v0.2.0" }] };
	}
	return { ok: false, status: 404, json: async () => ({}) };
};

let probe = await githubLatestTag("someone", "dsh-skill-viewer");
assert(probe.tag === "v0.3.1" && probe.error === undefined, "githubLatestTag returns latest release tag");
assert(fetchCalls.length === 1 && /\/repos\/someone\/dsh-skill-viewer\/releases\/latest$/.test(fetchCalls[0]), "githubLatestTag hits the releases/latest endpoint");

fetchCalls.length = 0;
globalThis.fetch = async (url) => {
	fetchCalls.push(String(url));
	return { ok: false, status: 404, json: async () => ({}) };
};
probe = await githubLatestTag("someone", "dsh-skill-viewer");
assert(probe.error !== undefined && /没有 GitHub Release 或 tag/.test(probe.error), "no releases → error message");
assert(fetchCalls.length === 2 && /\/tags$/.test(fetchCalls[1]), "no releases → tags fallback attempted");

globalThis.fetch = async () => { throw new Error("ECONNREFUSED"); };
probe = await githubLatestTag("someone", "dsh-skill-viewer");
assert(probe.error !== undefined && /GitHub API 请求失败/.test(probe.error), "network failure surfaces as error");

globalThis.fetch = realFetch;

// --- full check flow against a fake profile ---

const profileDir = join(tmp, "profiles", "web");
mkdirSync(join(profileDir, "node_modules", "dsh-skill-viewer"), { recursive: true });
mkdirSync(join(profileDir, "node_modules", "dsh-link-dep"), { recursive: true });
writeFileSync(join(profileDir, "package.json"), JSON.stringify({
	name: "dsh-profile-web",
	private: true,
	dependencies: {
		"dsh-skill-viewer": "github:someone/dsh-skill-viewer",
		"dsh-link-dep": "link:E:/somewhere"
	}
}, null, 2));
writeFileSync(join(profileDir, "node_modules", "dsh-skill-viewer", "package.json"), JSON.stringify({
	name: "dsh-skill-viewer",
	version: "0.2.2"
}, null, 2));
writeFileSync(join(profileDir, "node_modules", "dsh-link-dep", "package.json"), JSON.stringify({
	name: "dsh-link-dep",
	version: "0.0.1"
}, null, 2));

globalThis.fetch = async (url) => {
	const path = new URL(String(url)).pathname;
	if (path.endsWith("/releases/latest")) return { ok: true, status: 200, json: async () => ({ tag_name: "v0.3.1" }) };
	return { ok: false, status: 404, json: async () => ({}) };
};

const routes = [];
const effects = [];
const fakeCtx = {
	get: () => undefined,
	on: () => () => {},
	effect: (cb) => {
		const disposer = typeof cb === "function" ? cb() : undefined;
		effects.push(() => { if (typeof disposer === "function") disposer(); });
		return () => {};
	},
	webServer: {
		register: (route) => {
			routes.push(route);
			return () => {};
		},
	},
	loader: { entries: () => [] },
};

const { register } = await import("../lib/features/update-plugin.js");
const fakeApi = {
	fence: () => true,
	writeOk: (res, value) => { res.body = JSON.stringify({ ok: true, value }); },
	writeError: (res, code, message, status) => { res.body = JSON.stringify({ ok: false, error: { code, message } }); res.status = status; },
	readJsonBody: async () => ({}),
	log: () => {},
};
register(fakeCtx, fakeApi);

const route = routes.find((r) => r.path === "/dsh-tools/update-plugin/api");
assert(route !== undefined, "update-plugin route registered");

async function call(method, payload) {
	const res = { status: 200, body: "" };
	await route.handler({ method: "POST", url: "/dsh-tools/update-plugin/api/" + method, headers: {} }, res);
	return JSON.parse(res.body);
}

let result = await call("check", {});
assert(result.ok === true, "check returns ok envelope");
const gh = result.value.plugins.find((p) => p.name === "dsh-skill-viewer");
assert(gh !== undefined, "github plugin listed");
assert(gh.skip === false, "github plugin not skipped");
assert(gh.kind === "github", "github plugin kind reported");
assert(gh.current === "0.2.2", "current version read from node_modules");
assert(gh.latest === "0.3.1", "latest from GitHub release tag");
assert(gh.outdated === true, "0.2.2 < 0.3.1 → outdated");
const linkDep = result.value.plugins.find((p) => p.name === "dsh-link-dep");
assert(linkDep !== undefined && linkDep.skip === true, "link: dep still skipped");

// error path: GitHub API down → error text, not a crash
globalThis.fetch = async () => { throw new Error("ECONNREFUSED"); };
result = await call("check", {});
const ghErr = result.value.plugins.find((p) => p.name === "dsh-skill-viewer");
assert(ghErr !== undefined && ghErr.error !== "" && /GitHub API 请求失败/.test(ghErr.error), "github probe failure surfaces as error");
assert(ghErr.outdated === false, "no version when probe fails");

globalThis.fetch = realFetch;

// cleanup
for (const dispose of effects) dispose();
rmSync(tmp, { recursive: true, force: true });

if (failures > 0) {
	console.error(`\nGITHUB-SMOKE FAILED: ${failures} assertion(s)`);
	process.exit(1);
}
console.log("\nGITHUB-SMOKE OK: all assertions passed");
