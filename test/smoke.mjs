/**
 * dsh-tools — host framework smoke test (no real server required).
 *
 * Runs the host half against a fake Cordis ctx and fake req/res pairs:
 *   - boot: apply() registers the framework route without throwing;
 *   - config snapshot: 6 features, P0 defaults on, merged defaults off;
 *   - config/set: persists to <DSH_HOME>/profiles/web/plugins-data/dsh-tools.json
 *     and hot-applies (delete-chat route appears/disappears with the toggle);
 *   - plugin-catalog: classification projection through the real route
 *     (fake manifest + loader entries) and its toggle gating;
 *   - merged route serves a graceful error when services are unavailable;
 *   - trust fence rejects cross-site requests;
 *   - feature methods (restart) are gated when the feature is off
 *     (never executed — it would exit the process).
 *
 * Run:  node test/smoke.mjs
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "dsh-tools-smoke-"));
process.env.DSH_HOME = tmp;

const { apply } = await import("../lib/index.js");

const routes = [];
const effects = [];
const listeners = new Map();
const fakeCtx = {
	get: () => undefined,
	on: (name, fn) => {
		if (!listeners.has(name)) listeners.set(name, []);
		listeners.get(name).push(fn);
		return () => {
			const list = listeners.get(name);
			const index = list === undefined ? -1 : list.indexOf(fn);
			if (index >= 0) list.splice(index, 1);
		};
	},
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

apply(fakeCtx);

function fakeReq(method, path, body) {
	const req = { method, url: path, headers: { host: "127.0.0.1:3080" } };
	req[Symbol.asyncIterator] = async function* () {
		yield JSON.stringify(body ?? {});
	};
	req.on = () => {};
	return req;
}

function fakeRes() {
	const res = { status: 0, body: "", headers: undefined, ended: false };
	res.writeHead = (s, headers) => { res.status = s; res.headers = headers; };
	res.write = (chunk) => { res.body += typeof chunk === "string" ? chunk : ""; };
	res.end = (chunk) => { res.body += typeof chunk === "string" ? chunk : ""; res.ended = true; };
	res.on = () => {};
	return res;
}

async function call(route, method, path, body) {
	const req = fakeReq(method, path, body);
	const res = fakeRes();
	await route.handler(req, res);
	return { status: res.status, body: res.body === "" ? null : JSON.parse(res.body) };
}

let failures = 0;
function assert(cond, msg) {
	if (!cond) {
		failures += 1;
		console.error("FAIL:", msg);
	} else {
		console.log("ok:", msg);
	}
}

const apiRoute = routes.find((r) => r.path === "/dsh-tools/api");
assert(apiRoute !== undefined, "framework route /dsh-tools/api registered");

// --- config snapshot ---
let r = await call(apiRoute, "POST", "/dsh-tools/api/config", {});
assert(r.status === 200 && r.body.ok === true, "config returns ok envelope");
assert(r.body.value.features.length === 9, "config snapshot lists 9 features");
assert(r.body.value.features.find((f) => f.key === "notify.task-done").enabled === true, "notify.task-done defaults on");
assert(r.body.value.features.find((f) => f.key === "restart.web").enabled === true, "restart.web defaults on");
assert(r.body.value.features.find((f) => f.key === "delete-chat").enabled === true, "delete-chat defaults on");
assert(r.body.value.features.find((f) => f.key === "plugin-toggle").enabled === true, "plugin-toggle defaults on");
assert(r.body.value.features.find((f) => f.key === "update-plugin").enabled === true, "update-plugin defaults on");
assert(r.body.value.features.find((f) => f.key === "plugin-catalog").enabled === true, "plugin-catalog defaults on");
assert(r.body.value.features.find((f) => f.key === "question.collapse").enabled === true, "question.collapse defaults on");
assert(r.body.value.features.find((f) => f.key === "question.collapse").panel === false, "question.collapse is a non-panel feature");
assert(r.body.value.features.find((f) => f.key === "ui.enhance").enabled === false, "ui.enhance defaults off (stock look preserved)");
assert(r.body.value.features.find((f) => f.key === "ui.enhance").panel === true, "ui.enhance is a panel feature (own settings tab)");
assert(r.body.value.features.find((f) => f.key === "ui.enhance").hasConfig === true, "ui.enhance declares defaultConfig (hasConfig=true)");
assert(r.body.value.featureConfig["ui.enhance"].historyPosition === "off" && r.body.value.featureConfig["ui.enhance"].historyLimit === 10, "ui.enhance defaultConfig merged into featureConfig");
r = await call(apiRoute, "POST", "/dsh-tools/api/config/feature", { key: "ui.enhance", config: { historyPosition: "left" } });
assert(r.body.value.featureConfig["ui.enhance"].historyPosition === "left" && r.body.value.featureConfig["ui.enhance"].historyLimit === 10, "config/feature overlays defaultConfig without dropping untouched keys");
assert(r.body.value.features.find((f) => f.key === "ui.usage").enabled === false, "ui.usage defaults off (stock look preserved)");
assert(r.body.value.features.find((f) => f.key === "ui.usage").panel === true, "ui.usage is a panel feature (own settings tab)");
assert(r.body.value.features.find((f) => f.key === "notify.task-done").alwaysOn === false, "notify.task-done is optional (v0.7.0)");
assert(r.body.value.features.find((f) => f.key === "restart.web").alwaysOn === true, "restart.web is alwaysOn");
assert(r.body.value.features.find((f) => f.key === "delete-chat").alwaysOn === false, "delete-chat is optional");
assert(r.body.value.features.find((f) => f.key === "plugin-catalog").alwaysOn === false, "plugin-catalog is optional");
assert(r.body.value.features.find((f) => f.key === "plugin-catalog").panel === false, "plugin-catalog is a non-panel feature");
assert(r.body.value.features.find((f) => f.key === "notify.task-done").panel === false, "notify.task-done is a non-panel feature (no empty settings tab)");
assert(r.body.value.features.find((f) => f.key === "delete-chat").panel === true, "panel features default panel=true");

// --- per-feature config (方案A, v0.7.0) ---
assert(r.body.value.featureConfig !== undefined && typeof r.body.value.featureConfig === "object", "snapshot carries featureConfig");
assert(r.body.value.features.find((f) => f.key === "delete-chat").hasConfig === false, "features without defaultConfig report hasConfig=false");
r = await call(apiRoute, "POST", "/dsh-tools/api/config/feature", { key: "delete-chat", config: { showSizes: true } });
assert(r.status === 200 && r.body.value.featureConfig["delete-chat"].showSizes === true, "config/feature writes per-feature config");
const storedCfg = JSON.parse(readFileSync(join(tmp, "profiles", "web", "plugins-data", "dsh-tools.json"), "utf8"));
assert(storedCfg.featureConfig !== undefined && storedCfg.featureConfig["delete-chat"].showSizes === true, "featureConfig persisted to disk");
r = await call(apiRoute, "POST", "/dsh-tools/api/config/feature", { key: "delete-chat", config: { showSizes: false } });
assert(r.body.value.featureConfig["delete-chat"].showSizes === false, "config/feature overwrites a key");
r = await call(apiRoute, "POST", "/dsh-tools/api/config/feature", { key: "no-such-feature", config: { a: 1 } });
assert(r.status === 500, "config/feature rejects unknown feature keys");

// --- SSE + notify pipeline (agent/status → filter → broadcast → stream) ---

const agentStatusListeners = listeners.get("agent/status") ?? [];
assert(agentStatusListeners.length === 1, "notify.task-done subscribed to agent/status");

const sseRes = fakeRes();
await apiRoute.handler(fakeReq("GET", "/dsh-tools/api/events", {}), sseRes);
assert(sseRes.status === 200, "GET events opens the SSE stream");
assert(sseRes.headers !== undefined && /text\/event-stream/.test(sseRes.headers["content-type"] ?? ""), "SSE content-type set");
assert(sseRes.body.startsWith(": connected"), "SSE hello sent");

agentStatusListeners[0]({ status: "idle", agent: { id: "session-abc" } });
assert(sseRes.body.includes('"type":"turn-done"') && sseRes.body.includes('"sessionId":"session-abc"'), "root-agent idle broadcast reaches the SSE client");

const beforeLength = sseRes.body.length;
agentStatusListeners[0]({ status: "running", agent: { id: "session-abc" } });
assert(sseRes.body.length === beforeLength, "running status is not broadcast");

// --- notify.task-done is now toggleable (v0.7.0): disable disposes the
// agent/status listener and closes the SSE hub; re-enable restores both ---
r = await call(apiRoute, "POST", "/dsh-tools/api/config/set", { key: "notify.task-done", enabled: false });
assert(r.body.value.features.find((f) => f.key === "notify.task-done").enabled === false, "notify.task-done can be disabled");
assert((listeners.get("agent/status") ?? []).length === 0, "agent/status listener disposed after disable");
const sseDisabledRes = fakeRes();
await apiRoute.handler(fakeReq("GET", "/dsh-tools/api/events", {}), sseDisabledRes);
assert(sseDisabledRes.status === 404 && JSON.parse(sseDisabledRes.body).ok === false, "GET events rejected while notify.task-done is off");
r = await call(apiRoute, "POST", "/dsh-tools/api/config/set", { key: "notify.task-done", enabled: true });
assert(r.body.value.features.find((f) => f.key === "notify.task-done").enabled === true, "notify.task-done can be re-enabled");
assert((listeners.get("agent/status") ?? []).length === 1, "agent/status listener re-registered after re-enable");
const sseAgainRes = fakeRes();
await apiRoute.handler(fakeReq("GET", "/dsh-tools/api/events", {}), sseAgainRes);
assert(sseAgainRes.status === 200, "GET events streams again after re-enable");

// --- isRootAgent: id-based comparison survives instance churn ---
const { isRootAgent } = await import("../lib/features/notify-task-done.js");
const rootsA = [{ id: "root-1" }, { id: "root-2" }];
assert(isRootAgent({ roots: () => rootsA }, { id: "root-2" }) === true, "root agent by id passes");
assert(isRootAgent({ roots: () => [{ id: "root-1" }, { id: "root-2" }] }, { id: "root-2" }) === true, "different instance with the same id still passes (identity-churn safe)");
assert(isRootAgent({ roots: () => rootsA }, { id: "sub-9" }) === false, "non-root agent filtered out");
assert(isRootAgent(undefined, { id: "x" }) === true, "missing agents service falls back to accept");
assert(isRootAgent({ roots: () => { throw new Error("boom"); } }, { id: "x" }) === true, "roots() failure falls back to accept");
assert(isRootAgent({ roots: () => [] }, { id: "x" }) === false, "empty roots filters everything");
assert(isRootAgent({ roots: () => rootsA }, undefined) === false, "missing agent payload is filtered");


// --- alwaysOn forcing for the restart feature (never invoked here) ---
r = await call(apiRoute, "POST", "/dsh-tools/api/config/set", { key: "restart.web", enabled: false });
assert(r.body.value.features.find((f) => f.key === "restart.web").enabled === true, "restart.web cannot be disabled (alwaysOn)");

// --- toggle hot-apply: delete-chat on → route registered ---
r = await call(apiRoute, "POST", "/dsh-tools/api/config/set", { key: "delete-chat", enabled: true });
assert(r.status === 200 && r.body.value.features.find((f) => f.key === "delete-chat").enabled === true, "config/set enables delete-chat");
const dcRoute = routes.find((x) => x.path === "/dsh-tools/delete-chat/api");
assert(dcRoute !== undefined, "delete-chat route registered after toggle-on");
r = await call(dcRoute, "POST", "/dsh-tools/delete-chat/api/list", {});
assert(r.status === 500 && r.body.ok === false && /会话服务尚未就绪/.test(r.body.error.message), "delete-chat list reports services-unavailable gracefully");

// --- persistence ---
assert(existsSync(join(tmp, "profiles", "web", "plugins-data", "dsh-tools.json")), "config persisted to plugins-data/dsh-tools.json");

// --- toggle off → config reflects it, and re-enable re-registers ---
r = await call(apiRoute, "POST", "/dsh-tools/api/config/set", { key: "delete-chat", enabled: false });
assert(r.body.value.features.find((f) => f.key === "delete-chat").enabled === false, "config/set disables delete-chat");
r = await call(apiRoute, "POST", "/dsh-tools/api/config/set", { key: "delete-chat", enabled: true });
const dcRoutes = routes.filter((x) => x.path === "/dsh-tools/delete-chat/api");
assert(dcRoutes.length === 2, "delete-chat route re-registered after toggle cycle");
r = await call(apiRoute, "POST", "/dsh-tools/api/config/set", { key: "delete-chat", enabled: false });

// --- delete-chat list: workspace grouping + storage sizes (fake services,
// real temp directories for dirSize) ---

const spawns = [];
// Real directories under tmp so dirSize can compute real byte counts.
const sessionsRoot = join(tmp, "sessions");
mkdirSync(join(sessionsRoot, "session-1", "sub"), { recursive: true });
writeFileSync(join(sessionsRoot, "session-1", "session.jsonl"), "1234567890"); // 10 B
writeFileSync(join(sessionsRoot, "session-1", "sub", "extra.bin"), "abcde"); // +5 B
mkdirSync(join(sessionsRoot, "session-2"), { recursive: true });
writeFileSync(join(sessionsRoot, "session-2", "session.jsonl"), "0123456789ABCDEF"); // 16 B
mkdirSync(join(sessionsRoot, "session-3"), { recursive: true });
writeFileSync(join(sessionsRoot, "session-3", "session.jsonl"), "x".repeat(2048)); // 2048 B
mkdirSync(join(sessionsRoot, "session-4"), { recursive: true });
writeFileSync(join(sessionsRoot, "session-4", "session.jsonl"), "yyyy"); // 4 B
const wsA = join(tmp, "ws-a");
mkdirSync(wsA, { recursive: true });
writeFileSync(join(wsA, "payload.bin"), "p".repeat(100)); // 100 B
const wsB = join(tmp, "ws-b-missing"); // never created → dirSize null
fakeCtx.get = (name) => {
	if (name === "sessionQuery") {
		return {
			listSessions: async () => [
				{ header: { id: "session-1", createdAt: 1000 }, live: false, persisted: true },
				{ header: { id: "session-2", createdAt: 2000 }, live: false, persisted: true },
				{ header: { id: "session-3", createdAt: 3000 }, live: true, persisted: true },
				{ header: { id: "session-4", createdAt: 4000 }, live: false, persisted: true },
			],
			readTitleSnapshots: async (ids) => ids.map((sessionId) => ({ sessionId, status: "fulfilled", value: { title: { title: "标题-" + sessionId } } })),
		};
	}
	if (name === "sessionPersistence") {
		return {
			locate: (header) => ({ kind: "jsonl", path: join(sessionsRoot, header.id, "session.jsonl") }),
		};
	}
	if (name === "workspaceRegistry") {
		return {
			archivedSessionIds: [],
			list: () => [
				{ id: "ws-a", path: wsA, title: "工作区A", sessionIds: ["session-1", "session-3"] },
				{ id: "ws-b", path: wsB, title: "工作区B", sessionIds: ["session-2"] },
			],
		};
	}
	if (name === "subprocess") {
		return {
			resolveExecutable: async (requested) => requested,
			spawn: (spec) => {
				spawns.push(spec);
				return { done: Promise.resolve({ exitCode: 0 }), collected: {} };
			},
		};
	}
	return undefined;
};
r = await call(apiRoute, "POST", "/dsh-tools/api/config/set", { key: "delete-chat", enabled: true });
r = await call(dcRoute, "POST", "/dsh-tools/delete-chat/api/list", {});
assert(r.status === 200 && r.body.ok === true, "delete-chat list succeeds with services present");
const listed = r.body.value;
assert(listed.length === 4, "list returns all sessions");
assert(listed.find((s) => s.id === "session-1").workspace.path === wsA, "session workspace resolved from workspaceRegistry");
assert(listed.find((s) => s.id === "session-2").workspace.id === "ws-b", "second workspace mapped");
assert(listed.find((s) => s.id === "session-3").workspace.id === "ws-a" && listed.find((s) => s.id === "session-3").workspace.title === "工作区A", "workspace id and title carried");
assert(listed.find((s) => s.id === "session-4").workspace === null, "sessions outside every workspace carry workspace null");
// storage sizes (v0.7.1): session dir totals; workspace size = SUM of its
// sessions' chat records (NOT the workspace directory itself)
assert(listed.find((s) => s.id === "session-1").sizeBytes === 15, "session size sums the whole directory tree (10+5)");
assert(listed.find((s) => s.id === "session-2").sizeBytes === 16, "session size is the transcript file size");
assert(listed.find((s) => s.id === "session-3").sizeBytes === 2048, "larger transcript size reported");
assert(listed.find((s) => s.id === "session-4").sizeBytes === 4, "tiny session size reported");
assert(listed.find((s) => s.id === "session-1").workspace.sizeBytes === 2063, "workspace size = sum of its sessions' chat records (15+2048), not the workspace dir (100)");
assert(listed.find((s) => s.id === "session-2").workspace.sizeBytes === 16, "workspace size works even when the workspace dir is missing");

// --- delete-chat open-folder: workspace whitelist + launcher spawn (v0.6.1) ---

r = await call(dcRoute, "POST", "/dsh-tools/delete-chat/api/open-folder", { path: wsA });
assert(r.status === 200 && r.body.ok === true && r.body.value.ok === true, "open-folder opens a known workspace");
const scriptFile = join(tmp, "profiles", "web", "plugins-data", "dsh-tools-open-folder.ps1");
assert(existsSync(scriptFile), "open-folder launcher script written");
assert(spawns.length === 1 && spawns[0].argv[0] === "powershell.exe" && spawns[0].argv.includes("-File") && spawns[0].argv.includes(scriptFile) && spawns[0].argv[spawns[0].argv.length - 1] === wsA, "powershell launcher spawned with the workspace path");
r = await call(dcRoute, "POST", "/dsh-tools/delete-chat/api/open-folder", { path: "C:\\evil" });
assert(r.status === 200 && r.body.ok === true && r.body.value.ok === false && r.body.value.error === "not-a-workspace", "non-workspace path rejected");
assert(spawns.length === 1, "rejected path never spawns the launcher");
r = await call(dcRoute, "POST", "/dsh-tools/delete-chat/api/open-folder", { path: "" });
assert(r.body.value.ok === false && r.body.value.error === "bad-request", "empty path rejected");

// --- plugin-catalog: classification API (real route, fake manifest + loader) ---

const fakeProfile = join(tmp, "profiles", "web");
mkdirSync(fakeProfile, { recursive: true });
writeFileSync(join(fakeProfile, "package.json"), JSON.stringify({
	name: "fake-profile",
	dependencies: {
		"dsh-tools": "link:E:/dev/dsh-tools",
		"dshmarket": "^1.4.1",
		"dsh-skill-viewer": "github:someone/dsh-skill-viewer#v0.3.1",
	},
}, null, 2) + "\n");
fakeCtx.loader.entries = () => [
	{ id: "dsh-base", options: { name: "@deepseek-ai/dsh-base" }, disabled: false, fiber: { state: 2 } },
	{ id: "cordis", options: { name: "cordis" }, disabled: false, fiber: { state: 2 } },
	{ id: "dsh-tools", options: { name: "dsh-tools" }, disabled: false, fiber: { state: 2 } },
	{ id: "dshmarket", options: { name: "dshmarket" }, disabled: false, fiber: { state: 3 } },
	{ id: "dsh-skill-viewer", options: { name: "dsh-skill-viewer" }, disabled: true, fiber: undefined },
	{ id: "grp", options: { group: true, name: "group" }, disabled: false, fiber: { state: 2 } },
];
r = await call(apiRoute, "POST", "/dsh-tools/api/plugin-catalog", {});
assert(r.status === 200 && r.body.ok === true, "plugin-catalog returns ok envelope");
const catEntries = r.body.value.entries;
assert(catEntries.length === 5, "group entries are skipped");
assert(catEntries.find((e) => e.entryId === "dsh-base").category === "official", "@deepseek-ai scope classifies official");
assert(catEntries.find((e) => e.entryId === "cordis").category === "official", "harness transitive (not in deps) classifies official");
const localEntry = catEntries.find((e) => e.entryId === "dsh-tools");
assert(localEntry.category === "local" && /^link:/.test(localEntry.spec), "link: spec classifies local and carries the spec");
assert(catEntries.find((e) => e.entryId === "dshmarket").category === "installed", "semver spec classifies installed");
const skillEntry = catEntries.find((e) => e.entryId === "dsh-skill-viewer");
assert(skillEntry.category === "installed" && skillEntry.enabled === false, "github: spec classifies installed; disabled preserved");
assert(skillEntry.fiberPhase === null, "unobserved fiber maps to null");
assert(catEntries.find((e) => e.entryId === "dshmarket").fiberPhase === "failed", "failed fiber maps to failed");

// --- plugin-catalog: toggle gating (404 while disabled, restored on re-enable) ---
r = await call(apiRoute, "POST", "/dsh-tools/api/config/set", { key: "plugin-catalog", enabled: false });
assert(r.body.value.features.find((f) => f.key === "plugin-catalog").enabled === false, "config/set disables plugin-catalog");
r = await call(apiRoute, "POST", "/dsh-tools/api/plugin-catalog", {});
assert(r.status === 404 && r.body.error.code === "feature-disabled", "plugin-catalog method 404s while disabled");
r = await call(apiRoute, "POST", "/dsh-tools/api/config/set", { key: "plugin-catalog", enabled: true });
assert(r.body.value.features.find((f) => f.key === "plugin-catalog").enabled === true, "config/set re-enables plugin-catalog");
r = await call(apiRoute, "POST", "/dsh-tools/api/plugin-catalog", {});
assert(r.status === 200 && r.body.ok === true, "plugin-catalog method works again after re-enable");

// --- plugin-toggle list: description + GitHub home (v0.6.0) ---

mkdirSync(join(fakeProfile, "node_modules", "dshmarket"), { recursive: true });
writeFileSync(join(fakeProfile, "node_modules", "dshmarket", "package.json"), JSON.stringify({
	name: "dshmarket",
	version: "1.4.1",
	description: "可视化插件市场",
	repository: { type: "git", url: "git+https://github.com/dsh-market/dsh-market.git" },
}, null, 2) + "\n");
mkdirSync(join(fakeProfile, "node_modules", "dsh-skill-viewer"), { recursive: true });
writeFileSync(join(fakeProfile, "node_modules", "dsh-skill-viewer", "package.json"), JSON.stringify({
	name: "dsh-skill-viewer",
	version: "0.3.1",
	description: "技能浏览插件",
}, null, 2) + "\n");
const ptRoute = routes.find((x) => x.path === "/dsh-tools/plugin-toggle/api");
assert(ptRoute !== undefined, "plugin-toggle route registered");
r = await call(ptRoute, "POST", "/dsh-tools/plugin-toggle/api/list", {});
assert(r.status === 200 && r.body.ok === true, "plugin-toggle list returns ok envelope");
const ptList = r.body.value.plugins;
const mkt = ptList.find((p) => p.name === "dshmarket");
assert(mkt !== undefined && mkt.description === "可视化插件市场" && Array.isArray(mkt.descriptions) && mkt.descriptions.length === 1 && mkt.descriptions[0] === "可视化插件市场", "registry plugin carries its package description");
assert(mkt.home === "https://github.com/dsh-market/dsh-market", "registry plugin home derived from repository field");
const sv = ptList.find((p) => p.name === "dsh-skill-viewer");
assert(sv !== undefined && sv.home === "https://github.com/someone/dsh-skill-viewer", "github: spec plugin home derived from spec");
assert(sv.description === "技能浏览插件" && sv.descriptions.length === 1, "github plugin carries its package description");
const dt = ptList.find((p) => p.name === "dsh-tools");
assert(dt !== undefined && dt.home === null && dt.description === "" && dt.descriptions.length === 0, "link: spec plugin has no home/description");

// --- github-ref: homepage derivation chain (v0.6.0) ---

const { githubUrlOf, parseGithubSpec, isChinese, orderDescriptions } = await import("../lib/features/github-ref.js");
assert(githubUrlOf("github:a/b", null) === "https://github.com/a/b", "github: spec → homepage");
assert(githubUrlOf("github:a/b#v1.2.3", null) === "https://github.com/a/b", "github: spec with #tag → homepage");
assert(githubUrlOf("https://github.com/a/b/releases/download/v1/x.tgz", null) === "https://github.com/a/b", "release download URL → homepage");
assert(githubUrlOf("https://github.com/a/b/archive/refs/tags/v1.tar.gz", null) === "https://github.com/a/b", "archive tarball URL → homepage");
assert(githubUrlOf("link:E:/x", null) === null, "link: spec → null");
assert(githubUrlOf("^1.0.0", null) === null, "semver spec without repo → null");
assert(githubUrlOf("^1.0.0", { repository: "git+https://github.com/u/r.git" }) === "https://github.com/u/r", "repository string (git+https) → homepage");
assert(githubUrlOf("^1.0.0", { repository: { url: "https://github.com/u/r.git" } }) === "https://github.com/u/r", "repository.url object → homepage");
assert(githubUrlOf("^1.0.0", { repository: "git@github.com:u/r.git" }) === "https://github.com/u/r", "repository ssh form → homepage");
assert(githubUrlOf("^1.0.0", {}) === null, "repository missing → null");
assert(githubUrlOf("", null) === null, "empty spec → null");
const gs = parseGithubSpec("github:u/r#v2");
assert(gs !== null && gs.owner === "u" && gs.repo === "r" && gs.tag === "v2", "parseGithubSpec in github-ref keeps the shared shape");
assert(isChinese("中文描述") === true && isChinese("English only") === false, "CJK detection for zh-first ordering");
assert(orderDescriptions(["English desc", "", "中文描述", "English desc"]).join("|") === "中文描述|English desc", "descriptions ordered Chinese-first and deduped");
assert(orderDescriptions(["", null, "   "]).length === 0, "empty candidates dropped");
assert(orderDescriptions(["only english"]).join("|") === "only english", "english-only candidate stays single");

// --- trust fence ---
const crossReq = fakeReq("POST", "/dsh-tools/api/config", {});
crossReq.headers["sec-fetch-site"] = "cross-site";
const crossRes = fakeRes();
await apiRoute.handler(crossReq, crossRes);
assert(crossRes.status === 403, "cross-site request rejected by trust fence");

const badReq = fakeReq("POST", "/dsh-tools/api/config", {});
badReq.headers.host = "evil.example.com:3080";
const badRes = fakeRes();
await apiRoute.handler(badReq, badRes);
assert(badRes.status === 403, "non-loopback host rejected by trust fence");

// --- unknown method ---
r = await call(apiRoute, "POST", "/dsh-tools/api/nope", {});
assert(r.status === 404 && r.body.error.code === "not-found", "unknown api method 404s");

// --- ping ---
r = await call(apiRoute, "POST", "/dsh-tools/api/ping", {});
assert(r.status === 200 && r.body.value.ok === true, "ping responds ok");

// cleanup
for (const dispose of effects) dispose();
rmSync(tmp, { recursive: true, force: true });

if (failures > 0) {
	console.error(`\nSMOKE FAILED: ${failures} assertion(s)`);
	process.exit(1);
}
console.log("\nSMOKE OK: all assertions passed");
