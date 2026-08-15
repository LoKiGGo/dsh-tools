/**
 * dsh-tools — client bundle smoke test (Node, no browser required).
 *
 * Runs the classic client bundle against a fake window/ModuleLoader:
 *   - the bundle executes and exports apply + inject;
 *   - apply() registers the settings.section and shell.overlay entries;
 *   - (optional, when react-dom/server resolves) server-renders the two
 *     entry components to exercise their initial render paths.
 *
 * Run:  node test/client-smoke.mjs
 */

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const PROFILE_NODE_MODULES = "D:/profile/node_modules";

function resolveFromProfile(name) {
	try {
		return require.resolve(name, { paths: [PROFILE_NODE_MODULES] });
	} catch {
		return undefined;
	}
}

const reactPath = resolveFromProfile("react");
const reactDomServerPath = resolveFromProfile("react-dom/server");

let failures = 0;
function assert(cond, msg) {
	if (!cond) {
		failures += 1;
		console.error("FAIL:", msg);
	} else {
		console.log("ok:", msg);
	}
}

const React = reactPath === undefined ? undefined : require(reactPath);
const serverRender = reactDomServerPath === undefined ? undefined : require(reactDomServerPath).renderToString;

// --- fake browser globals (before the bundle executes) ---

let captured = null;
const reloaded = { value: false };
const timers = [];

globalThis.window = {
	__ModuleLoader__: {
		load: (entry) => {
			captured = entry.factory((name) => {
				if (name === "react") {
					if (React === undefined) throw new Error("react not resolvable in Node test");
					return React;
				}
				throw new Error("unexpected require: " + name);
			});
		},
	},
	dshDesktop: undefined,
	EventSource: class {
		constructor() {}
		close() {}
	},
	confirm: () => true,
	setInterval: () => 0,
	clearInterval: () => {},
	setTimeout: (fn) => {
		timers.push(fn);
		return timers.length;
	},
	clearTimeout: () => {},
	location: { reload: () => { reloaded.value = true; } },
};

globalThis.document = {
	getElementById: () => null,
	createElement: (tag) => ({ id: "", textContent: "", append: () => {} }),
	head: { append: () => {} },
	hasFocus: () => true,
};

await import("../lib/client.js");

assert(captured !== null, "bundle executed and exported a module");
assert(typeof captured.apply === "function", "client module exports apply");
assert(Array.isArray(captured.inject) && captured.inject.includes("slots") && captured.inject.includes("sessions"), "inject declares slots + sessions");

// --- apply() registration ---

const registered = [];
const opened = [];
const fakeCtx = {
	slots: {
		inject: (key, cb) => {
			cb();
			return () => {};
		},
		register: (opts, render) => {
			registered.push({ opts, render });
		},
	},
	sessions: { open: (id) => opened.push(id) },
};

const dispose = captured.apply(fakeCtx);
assert(typeof dispose === "function", "apply returns a disposer");
assert(registered.length === 2, "both slot entries registered");

const settingsReg = registered.find((r) => r.opts.name === "settings.section");
const overlayReg = registered.find((r) => r.opts.name === "shell.overlay");
assert(settingsReg !== undefined && settingsReg.opts.id === "dsh-tools" && settingsReg.opts.order === 35, "settings.section id dsh-tools order 35");
assert(overlayReg !== undefined && overlayReg.opts.id === "dsh-tools-notify", "shell.overlay id dsh-tools-notify");

// --- initial render paths (needs react + react-dom/server) ---

if (serverRender === undefined) {
	console.log("skip: react-dom/server not resolvable from profile graph; render paths not exercised");
} else {
	const fakeSessions = { current: undefined, byId: {} };
	const fakeUseSessions = (selector) => selector(fakeSessions);

	const settingsElement = settingsReg.render({ close: () => {} });
	assert(settingsElement !== null && settingsElement.type !== undefined, "settings section render returns an element");
	const html = serverRender(settingsElement);
	assert(typeof html === "string" && html.length > 0, "settings section renders without throwing");
	assert(html.includes("dsh 工具箱"), "settings heading present in rendered html");
	assert(html.includes("功能开关"), "manage tab always present");
	assert(html.includes("正在读取配置"), "loading state rendered before config arrives");
	assert(html.includes("一键重启"), "always-on restart card renders inside 功能开关 before config loads");
	assert(html.includes("桌面通知权限"), "always-on notification card renders inside 功能开关 before config loads");
	assert(!html.includes("会话管理"), "optional-feature rows hidden until config loads");

	const overlayElement = overlayReg.render({ useSessions: fakeUseSessions });
	assert(overlayElement !== null, "overlay render returns an element (null allowed only after mount logic)");
	const overlayHtml = serverRender(overlayElement);
	assert(overlayHtml === "", "overlay renders empty before any toasts");
}

	// --- turn-done decision logic (pure function, no DOM required) ---

	const decide = captured.__dshToolsTest && captured.__dshToolsTest.evaluateTurnDone;
	assert(typeof decide === "function", "test hook exports evaluateTurnDone");
	const CURRENT = "session-1";
	const byId = {
		"session-1": { id: "session-1", displayTitle: "当前会话" },
		"session-2": { id: "session-2", displayTitle: "另一个会话" },
	};

	// unfocused + matching session → toast with the session title
	let d = decide({ type: "turn-done", data: { sessionId: "session-1" } }, false, CURRENT, byId);
	assert(d !== null && d.sessionId === "session-1" && d.title === "当前会话", "unfocused matching session yields a toast with title");

	// focused → suppressed
	d = decide({ type: "turn-done", data: { sessionId: "session-1" } }, true, CURRENT, byId);
	assert(d === null, "focused page suppresses the toast");

	// other session → suppressed
	d = decide({ type: "turn-done", data: { sessionId: "session-2" } }, false, CURRENT, byId);
	assert(d === null, "other session suppresses the toast");

	// current session matches but byId lacks its summary → fallback title
	d = decide({ type: "turn-done", data: { sessionId: "session-1" } }, false, CURRENT, {});
	assert(d !== null && d.title === "会话任务已完成", "missing summary falls back to the generic title");

	// wrong message type / shape → ignored
	assert(decide({ type: "heartbeat" }, false, CURRENT, byId) === null, "non-turn-done messages ignored");
	assert(decide({ type: "turn-done", data: {} }, false, CURRENT, byId) === null, "missing sessionId ignored");
	assert(decide(null, false, CURRENT, byId) === null, "null message ignored");

	// no current session selected (hero screen) → any root session may toast
	d = decide({ type: "turn-done", data: { sessionId: "session-2" } }, false, undefined, byId);
	assert(d !== null && d.sessionId === "session-2", "no current session allows any root session");

	// --- native desktop notification payload ---

	const buildNotice = captured.__dshToolsTest && captured.__dshToolsTest.nativeNoticePayload;
	assert(typeof buildNotice === "function", "test hook exports nativeNoticePayload");
	const payload = buildNotice({ sessionId: "session-1", title: "当前会话" });
	assert(payload.title === "当前会话", "notification title carries the session title");
	assert(payload.body.indexOf("任务已完成") !== -1, "notification body mentions task completion");
	assert(payload.tag === "dsh-tools-turn-done-session-1", "notification tag dedupes per session");

	// --- settings tab model (pure function) ---

	const tabsOf = captured.__dshToolsTest && captured.__dshToolsTest.tabModel;
	assert(typeof tabsOf === "function", "test hook exports tabModel");
	let tabs = tabsOf(null);
	assert(tabs.length === 1 && tabs[0].key === "manage" && tabs[0].label === "功能开关", "null config yields only the manage tab");
	tabs = tabsOf({
		features: [
			{ key: "a", label: "功能A", enabled: true },
			{ key: "b", label: "功能B", enabled: false },
			{ key: "c", label: "功能C", enabled: true },
		],
	});
	assert(tabs.length === 3 && tabs[0].key === "manage" && tabs[1].key === "a" && tabs[2].key === "c", "enabled features become tabs in order, disabled ones excluded");
	tabs = tabsOf({
		features: [
			{ key: "notify.task-done", label: "任务完成提示", enabled: true, alwaysOn: true },
			{ key: "restart.web", label: "一键重启", enabled: true, alwaysOn: true },
			{ key: "a", label: "功能A", enabled: true },
		],
	});
	assert(tabs.length === 2 && tabs[0].key === "manage" && tabs[1].key === "a", "alwaysOn features get no tab of their own");

dispose();

if (failures > 0) {
	console.error(`\nCLIENT SMOKE FAILED: ${failures} assertion(s)`);
	process.exit(1);
}
console.log("\nCLIENT SMOKE OK: all assertions passed");
