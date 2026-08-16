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
assert(registered.length === 3, "three slot entries registered");

const settingsReg = registered.find((r) => r.opts.name === "settings.section");
const overlayReg = registered.find((r) => r.opts.name === "shell.overlay");
const catalogReg = registered.find((r) => r.opts.name === "settings.plugins.tab");
assert(settingsReg !== undefined && settingsReg.opts.id === "dsh-tools" && settingsReg.opts.order === 35, "settings.section id dsh-tools order 35");
assert(overlayReg !== undefined && overlayReg.opts.id === "dsh-tools-notify", "shell.overlay id dsh-tools-notify");
assert(catalogReg !== undefined && catalogReg.opts.id === "plugin-catalog" && catalogReg.opts.order === 20 && catalogReg.opts.label === "插件分类", "settings.plugins.tab entry id plugin-catalog order 20");

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

	const catalogElement = catalogReg.render({});
	assert(catalogElement !== null, "catalog tab render returns an element");
	const catalogHtml = serverRender(catalogElement);
	assert(catalogHtml.includes("插件分类"), "catalog heading present in rendered html");
	assert(catalogHtml.includes("官方：安装 Harness 自带"), "catalog hint present in rendered html");
	assert(catalogHtml.includes("正在读取插件"), "catalog renders loading state before config/data arrives");
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
	tabs = tabsOf({
		features: [
			{ key: "a", label: "功能A", enabled: true },
			{ key: "catalog", label: "插件分类视图", enabled: true, panel: false },
			{ key: "b", label: "功能B", enabled: true, panel: true },
		],
	});
	assert(tabs.length === 3 && tabs[1].key === "a" && tabs[2].key === "b", "panel:false features get no settings tab; panel:true (and unset) are included");

	// --- plugin-catalog pure helpers ---

	const catalogFilterFn = captured.__dshToolsTest && captured.__dshToolsTest.catalogFilter;
	const catalogCountsFn = captured.__dshToolsTest && captured.__dshToolsTest.catalogCounts;
	const catalogShortFn = captured.__dshToolsTest && captured.__dshToolsTest.catalogModuleShortName;
	const catalogTabReg = captured.__dshToolsTest && captured.__dshToolsTest.catalogTabRegistration;
	const catalogGate = captured.__dshToolsTest && captured.__dshToolsTest.catalogFetchGate;
	assert(typeof catalogFilterFn === "function" && typeof catalogCountsFn === "function" && typeof catalogShortFn === "function", "test hooks export catalog helpers");
	assert(typeof catalogTabReg === "function" && typeof catalogGate === "function", "test hooks export catalog visibility helpers");

	assert(catalogShortFn("@deepseek-ai/dsh-base") === "base", "short name strips the official scope and dsh- prefix (same rule as the official page)");
	assert(catalogShortFn("@deepseek-ai/dsh-host-plugin-inventory") === "plugin-inventory", "short name strips dsh-host- prefix");
	assert(catalogShortFn("dshmarket") === "dshmarket", "plain names pass through");
	assert(catalogShortFn("cordis:server") === "server", "short name strips cordis: builtins");

	const sampleEntries = [
		{ entryId: "a", moduleName: "@deepseek-ai/dsh-base", category: "official", enabled: true, fiberPhase: "active" },
		{ entryId: "b", moduleName: "dshmarket", category: "installed", enabled: true, fiberPhase: "active" },
		{ entryId: "c", moduleName: "dsh-tools", category: "local", enabled: false, fiberPhase: null },
		{ entryId: "d", moduleName: "dsh-better-sidebar", category: "installed", enabled: true, fiberPhase: "failed" },
	];
	const counts = catalogCountsFn(sampleEntries);
	assert(counts.official === 1 && counts.installed === 2 && counts.local === 1, "catalog counts per category");
	assert(catalogFilterFn(sampleEntries, "all", "").length === 4, "all category with empty query returns everything");
	assert(catalogFilterFn(sampleEntries, "installed", "").length === 2, "installed category filters to installed entries");
	assert(catalogFilterFn(sampleEntries, "all", "dsh-").length === 3, "query filters by module name");
	assert(catalogFilterFn(sampleEntries, "all", "DSH-BASE").length === 1, "query is case-insensitive");
	assert(catalogFilterFn(sampleEntries, "local", "market").length === 0, "category and query combine");

	assert(catalogTabReg(null, "plugin-catalog") === true, "null config registers the tab optimistically");
	assert(catalogTabReg({ features: [{ key: "plugin-catalog", enabled: false }] }, "plugin-catalog") === false, "disabled config hides the tab");
	assert(catalogTabReg({ features: [{ key: "plugin-catalog", enabled: true }] }, "plugin-catalog") === true, "enabled config keeps the tab");
	assert(catalogGate(null, "plugin-catalog") === "fetch", "null config fetches");
	assert(catalogGate({ features: [{ key: "plugin-catalog", enabled: false }] }, "plugin-catalog") === "disabled", "disabled config skips the fetch");

	// --- 更新检查 auto-check decision (pure function) ---

	const decideCheck = captured.__dshToolsTest && captured.__dshToolsTest.updateCheckDecision;
	assert(typeof decideCheck === "function", "test hook exports updateCheckDecision");
	// 页面加载后首次打开面板 → 自动检查
	assert(decideCheck({ autoChecked: false, inFlight: false, data: null }) === "check", "first open after page load runs the check");
	// 已自动检查过 → 恢复缓存结果，不再发起请求
	assert(decideCheck({ autoChecked: true, inFlight: false, data: { plugins: [], error: null } }) === "restore", "later opens restore the cached result without a request");
	// 检查仍在进行中（切走又切回）→ 等待，不重复发起
	assert(decideCheck({ autoChecked: true, inFlight: true, data: null }) === "wait", "an in-flight check is not duplicated");
	// 空/未初始化 store → 视为首次打开
	assert(decideCheck(undefined) === "check" && decideCheck(null) === "check", "missing store falls back to checking");

	// --- 会话管理 load decision (pure function) ---

	const decideLoad = captured.__dshToolsTest && captured.__dshToolsTest.deleteChatLoadDecision;
	assert(typeof decideLoad === "function", "test hook exports deleteChatLoadDecision");
	// 页面加载后首次打开面板 → 自动加载列表
	assert(decideLoad({ autoLoaded: false, inFlight: false, data: null }) === "load", "first open after page load loads the list");
	// 已自动加载过 → 恢复缓存结果，不再发起请求
	assert(decideLoad({ autoLoaded: true, inFlight: false, data: { sessions: [] } }) === "restore", "later opens restore the cached list without a request");
	// 加载仍在进行中（切走又切回）→ 等待，不重复发起
	assert(decideLoad({ autoLoaded: true, inFlight: true, data: null }) === "wait", "an in-flight load is not duplicated");
	// 空/未初始化 store → 视为首次打开
	assert(decideLoad(undefined) === "load" && decideLoad(null) === "load", "missing store falls back to loading");

	// --- 会话管理 workspace grouping (pure function) ---

	const groupSessions = captured.__dshToolsTest && captured.__dshToolsTest.groupSessionsByWorkspace;
	assert(typeof groupSessions === "function", "test hook exports groupSessionsByWorkspace");

	const wsA = { id: "ws-a", path: "C:\\work\\a", title: "工作区A" };
	const wsB = { id: "ws-b", path: "D:\\repo\\b", title: "工作区B" };
	const sampleSessions = [
		{ id: "s1", title: "会话1", createdAt: 3000, workspace: wsA },
		{ id: "s2", title: "会话2", createdAt: 1000, workspace: wsB },
		{ id: "s3", title: "会话3", createdAt: 2000, workspace: wsA },
		{ id: "s4", title: "会话4", createdAt: 4000, workspace: null },
	];
	const groups = groupSessions(sampleSessions);
	assert(groups.length === 3, "sessions grouped by workspace");
	assert(groups[0].key === "C:\\work\\a" && groups[1].key === "D:\\repo\\b" && groups[2].key === "ungrouped", "groups sorted by path, ungrouped last");
	assert(groups[0].title === "工作区A" && groups[0].path === "C:\\work\\a", "group title prefers workspace title, path carried");
	assert(groups[2].title === "未分组" && groups[2].path === null, "ungrouped group uses the fallback title");
	assert(groups[0].sessions.length === 2 && groups[0].sessions[0].id === "s1" && groups[0].sessions[1].id === "s3", "within-group order newest first");
	assert(groups[1].sessions.length === 1 && groups[1].sessions[0].id === "s2", "single-session group kept");
	assert(groups[2].sessions.length === 1 && groups[2].sessions[0].id === "s4", "ungrouped sessions listed in their group");
	assert(groupSessions([]).length === 0, "empty list yields no groups");
	assert(groupSessions(undefined).length === 0, "missing list yields no groups");
	assert(groupSessions(null).length === 0, "null list yields no groups");
	// workspace 字段缺失 → 归入未分组
	assert(groupSessions([{ id: "x", createdAt: 1 }])[0].key === "ungrouped", "sessions without workspace fall into 未分组");
	// 组内顺序稳定：createdAt 相同保持输入顺序
	const tie = groupSessions([
		{ id: "a", createdAt: 5, workspace: wsA },
		{ id: "b", createdAt: 5, workspace: wsA },
	]);
	assert(tie[0].sessions[0].id === "a" && tie[0].sessions[1].id === "b", "equal createdAt keeps input order (stable sort)");
	// workspace 只有 title 没有 path（异常数据）→ 按 title 分组兜底不行则归未分组
	assert(groupSessions([{ id: "y", createdAt: 1, workspace: { title: "无路径" } }])[0].key === "ungrouped", "workspace without path falls into 未分组");

dispose();

if (failures > 0) {
	console.error(`\nCLIENT SMOKE FAILED: ${failures} assertion(s)`);
	process.exit(1);
}
console.log("\nCLIENT SMOKE OK: all assertions passed");
