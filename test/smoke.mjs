/**
 * dsh-tools — host framework smoke test (no real server required).
 *
 * Runs the host half against a fake Cordis ctx and fake req/res pairs:
 *   - boot: apply() registers the framework route without throwing;
 *   - config snapshot: 5 features, P0 defaults on, merged defaults off;
 *   - config/set: persists to <DSH_HOME>/profiles/web/plugins-data/dsh-tools.json
 *     and hot-applies (delete-chat route appears/disappears with the toggle);
 *   - merged route serves a graceful error when services are unavailable;
 *   - trust fence rejects cross-site requests;
 *   - feature methods (restart) are gated when the feature is off
 *     (never executed — it would exit the process).
 *
 * Run:  node test/smoke.mjs
 */

import { existsSync, mkdtempSync, rmSync } from "node:fs";
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
assert(r.body.value.features.length === 5, "config snapshot lists 5 features");
assert(r.body.value.features.find((f) => f.key === "notify.task-done").enabled === true, "notify.task-done defaults on");
assert(r.body.value.features.find((f) => f.key === "restart.web").enabled === true, "restart.web defaults on");
assert(r.body.value.features.find((f) => f.key === "delete-chat").enabled === true, "delete-chat defaults on");
assert(r.body.value.features.find((f) => f.key === "plugin-toggle").enabled === true, "plugin-toggle defaults on");
assert(r.body.value.features.find((f) => f.key === "update-plugin").enabled === true, "update-plugin defaults on");
assert(r.body.value.features.find((f) => f.key === "notify.task-done").alwaysOn === true, "notify.task-done is alwaysOn");
assert(r.body.value.features.find((f) => f.key === "restart.web").alwaysOn === true, "restart.web is alwaysOn");
assert(r.body.value.features.find((f) => f.key === "delete-chat").alwaysOn === false, "delete-chat is optional");

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

// --- alwaysOn forcing: disable requests are ignored, pipeline stays live ---
r = await call(apiRoute, "POST", "/dsh-tools/api/config/set", { key: "notify.task-done", enabled: false });
assert(r.body.value.features.find((f) => f.key === "notify.task-done").enabled === true, "notify.task-done cannot be disabled (alwaysOn)");
assert((listeners.get("agent/status") ?? []).length === 1, "agent/status listener survives the disable attempt");
const sseForcedRes = fakeRes();
await apiRoute.handler(fakeReq("GET", "/dsh-tools/api/events", {}), sseForcedRes);
assert(sseForcedRes.status === 200, "GET events still streams after the disable attempt");

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
