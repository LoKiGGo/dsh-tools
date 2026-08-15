/**
 * Disposable harness for restart-sequence-smoke.mjs.
 *
 * - First life (DSH_TEST_RESTART_SEQ=1): boot the host plugin against a fake
 *   ctx and invoke the REAL restart method through the framework route. The
 *   handler responds {ok:true}, spawns the delayed launcher with this
 *   process's argv/env, and schedules process.exit(600ms) — the test process
 *   ends itself, exactly like the real server would.
 * - Second life (any other value, set by the launcher-inherited env): write
 *   the marker file proving the relaunched process received the argv/env
 *   chain intact, then exit.
 */

import { writeFileSync } from "node:fs";

if (process.env.DSH_TEST_RESTART_SEQ !== "1") {
	const marker = process.env.DSH_TEST_MARKER;
	if (marker !== undefined && marker !== "") {
		writeFileSync(marker, "relaunched-ok", "utf8");
	}
	process.exit(0);
}

const { apply } = await import("../lib/index.js");

const routes = [];
const fakeCtx = {
	get: () => undefined,
	on: () => () => {},
	effect: (cb) => {
		if (typeof cb === "function") cb();
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

const apiRoute = routes.find((r) => r.path === "/dsh-tools/api");
if (apiRoute === undefined) {
	console.error("harness: framework route not registered");
	process.exit(2);
}

const req = { method: "POST", url: "/dsh-tools/api/restart", headers: { host: "127.0.0.1:3080" } };
req[Symbol.asyncIterator] = async function* () {
	yield "{}";
};
req.on = () => {};
const res = {
	status: 0,
	body: "",
	writeHead(status) {
		this.status = status;
	},
	write(chunk) {
		this.body += typeof chunk === "string" ? chunk : "";
	},
	end(chunk) {
		this.body += typeof chunk === "string" ? chunk : "";
	},
	on() {},
};

// Neutralize the recursive relaunch before the handler snapshots the env.
process.env.DSH_TEST_RESTART_SEQ = "0";
await apiRoute.handler(req, res);

const body = JSON.parse(res.body);
console.log("harness restart response:", res.status, JSON.stringify(body));
if (res.status !== 200 || body.ok !== true || body.value === undefined || body.value.ok !== true) {
	console.error("harness: unexpected restart response");
	process.exit(2);
}
console.log("harness: response ok — the restart handler will exit this process in ~600ms");
// The restart handler already scheduled process.exit(600ms). Do nothing.
