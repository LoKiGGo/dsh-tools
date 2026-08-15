/**
 * dsh-tools — profile-mutation smoke test for the merged plugin-toggle
 * feature (no real server, no real profile: everything under a temp DSH_HOME).
 *
 * Exercises the delicate file-editing paths through the feature's own route
 * handler: patch-row insert/remove (comments preserved), bundle toggling,
 * and feature gating.
 *
 * Run:  node test/mutations-smoke.mjs
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "dsh-tools-mutations-"));
process.env.DSH_HOME = tmp;

const profileDir = join(tmp, "profiles", "web");
mkdirSync(join(profileDir, "node_modules", "fake-plugin"), { recursive: true });
mkdirSync(join(profileDir, "node_modules", "fake-bundle"), { recursive: true });

const PATCH_FIXTURE = [
	"# 顶层注释，必须保留",
	"- insert:",
	"    - id: existing",
	"      name: 'existing-plugin'",
	"",
].join("\n");

const MANIFEST_FIXTURE = JSON.stringify({
	name: "dsh-profile-web",
	private: true,
	dependencies: {
		"fake-plugin": "^1.0.0",
		"fake-bundle": "^1.0.0",
	},
	dsh: { profile: { bundles: [] } },
}, null, 2) + "\n";

writeFileSync(join(profileDir, "cordis.patch.yml"), PATCH_FIXTURE);
writeFileSync(join(profileDir, "package.json"), MANIFEST_FIXTURE);
writeFileSync(join(profileDir, "node_modules", "fake-plugin", "package.json"), JSON.stringify({ name: "fake-plugin", version: "1.0.0" }));
writeFileSync(join(profileDir, "node_modules", "fake-bundle", "package.json"), JSON.stringify({ name: "fake-bundle", version: "1.0.0", dsh: { bundle: { patch: "./cordis.patch.yml" } } }));

const { apply } = await import("../lib/index.js");

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
			const entry = { route, active: true, disposals: 0 };
			routes.push(entry);
			return () => {
				entry.active = false;
				entry.disposals += 1;
			};
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
	const res = { status: 0, body: "", ended: false };
	res.writeHead = (s) => { res.status = s; };
	res.write = (chunk) => { res.body += typeof chunk === "string" ? chunk : ""; };
	res.end = (chunk) => { res.body += typeof chunk === "string" ? chunk : ""; res.ended = true; };
	res.on = () => {};
	return res;
}

async function call(entry, method, path, body) {
	if (!entry.active) {
		// Real server: an unregistered route 404s.
		return { status: 404, body: { ok: false, error: { code: "not-found", message: "route not registered" } } };
	}
	const req = fakeReq(method, path, body);
	const res = fakeRes();
	await entry.route.handler(req, res);
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

const readPatch = () => readFileSync(join(profileDir, "cordis.patch.yml"), "utf8");
const readManifest = () => readFileSync(join(profileDir, "package.json"), "utf8");

// enable the merged plugin-toggle feature
const apiRoute = routes.find((e) => e.route.path === "/dsh-tools/api");
let r = await call(apiRoute, "POST", "/dsh-tools/api/config/set", { key: "plugin-toggle", enabled: true });
assert(r.status === 200, "plugin-toggle feature enabled via config/set");
const toggleRoute = routes.find((e) => e.route.path === "/dsh-tools/plugin-toggle/api");
assert(toggleRoute !== undefined, "plugin-toggle route registered");

// list: both plugins, both disabled
r = await call(toggleRoute, "POST", "/dsh-tools/plugin-toggle/api/list", {});
assert(r.status === 200 && r.body.value.plugins.length === 2, "list returns 2 installed plugins");
const plain = r.body.value.plugins.find((p) => p.name === "fake-plugin");
const bundle = r.body.value.plugins.find((p) => p.name === "fake-bundle");
assert(plain !== undefined && plain.enabled === false && plain.isBundle === false, "fake-plugin plain and disabled");
assert(bundle !== undefined && bundle.enabled === false && bundle.isBundle === true, "fake-bundle bundle and disabled");

// enable plain plugin → patch row appended, comment preserved
r = await call(toggleRoute, "POST", "/dsh-tools/plugin-toggle/api/set", { name: "fake-plugin", enabled: true });
assert(r.status === 200 && r.body.value.changed === true, "set fake-plugin enabled");
const patched = readPatch();
assert(patched.startsWith("# 顶层注释，必须保留"), "patch comment preserved after insert");
assert(/name: 'fake-plugin'/.test(patched), "patch row added for fake-plugin");
assert(/name: 'existing-plugin'/.test(patched), "existing row untouched");

// disable plain plugin → patch restored byte-identical
r = await call(toggleRoute, "POST", "/dsh-tools/plugin-toggle/api/set", { name: "fake-plugin", enabled: false });
assert(r.status === 200 && r.body.value.changed === true, "set fake-plugin disabled");
assert(readPatch() === PATCH_FIXTURE, "patch file restored exactly after disable");

// bundle enable/disable
r = await call(toggleRoute, "POST", "/dsh-tools/plugin-toggle/api/set", { name: "fake-bundle", enabled: true });
assert(r.status === 200 && r.body.value.changed === true, "set fake-bundle enabled");
let manifest = JSON.parse(readManifest());
assert(manifest.dsh.profile.bundles.includes("fake-bundle"), "bundles includes fake-bundle");
r = await call(toggleRoute, "POST", "/dsh-tools/plugin-toggle/api/set", { name: "fake-bundle", enabled: false });
assert(r.status === 200 && r.body.value.changed === true, "set fake-bundle disabled");
manifest = JSON.parse(readManifest());
assert(!manifest.dsh.profile.bundles.includes("fake-bundle"), "bundles no longer includes fake-bundle");
assert(readManifest() === MANIFEST_FIXTURE, "manifest restored exactly after disable");

// feature gating: disabling the feature disposes the route; re-enabling re-registers
r = await call(apiRoute, "POST", "/dsh-tools/api/config/set", { key: "plugin-toggle", enabled: false });
assert(toggleRoute.active === false && toggleRoute.disposals === 1, "plugin-toggle route disposed when feature off");
r = await call(toggleRoute, "POST", "/dsh-tools/plugin-toggle/api/list", {});
assert(r.status === 404, "disposed route serves 404 (unregistered)");
r = await call(apiRoute, "POST", "/dsh-tools/api/config/set", { key: "plugin-toggle", enabled: true });
const toggleRoutes = routes.filter((e) => e.route.path === "/dsh-tools/plugin-toggle/api");
assert(toggleRoutes.length === 2 && toggleRoutes[1].active === true, "plugin-toggle route re-registered when feature back on");

// cleanup
for (const dispose of effects) dispose();
rmSync(tmp, { recursive: true, force: true });

if (failures > 0) {
	console.error(`\nMUTATIONS SMOKE FAILED: ${failures} assertion(s)`);
	process.exit(1);
}
console.log("\nMUTATIONS SMOKE OK: all assertions passed");
