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
import { homedir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
// Resolved at runtime so the public repo carries no machine-specific path.
const PROFILE_NODE_MODULES = join(homedir(), ".dsh/profiles/web/node_modules");

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
				if (name === "react-dom") {
					// 真实浏览器里 react-dom 是 shell-own static module；Node 测试
					// 中只用到 createPortal 的占位（面板折叠组件 SSR 阶段渲染 null）。
					return { createPortal: (node) => node };
				}
				if (name === "@deepseek-ai/dsh-client-ui-primitives") {
					// shell 静态表原子组件；Node 测试用桩（Markdown 节点视图不在 SSR 段）。
					const stub = () => null;
					return {
						MarkdownText: stub, MessageText: stub, JsonBlock: stub, Tooltip: stub,
						IconCopyOutline16: stub, IconCheckOutline16: stub,
						writeClipboard: async () => true,
					};
				}
				if (name === "@deepseek-ai/dsh-client-ui-attachment") {
					return { ImageGallery: () => null };
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
// settings.section + shell.overlay + 2× conversation.chat.node + details
// + assistant-actions + settings.plugins.tab
assert(registered.length === 7, "seven slot entries registered");

const settingsReg = registered.find((r) => r.opts.name === "settings.section");
const overlayReg = registered.find((r) => r.opts.name === "shell.overlay" && r.opts.id === "dsh-tools-notify");
const mdUserReg = registered.find((r) => r.opts.name === "conversation.chat.node" && r.opts.key === "user");
const mdSteeringReg = registered.find((r) => r.opts.name === "conversation.chat.node" && r.opts.key === "steering");
const detailsReg = registered.find((r) => r.opts.name === "details");
const pinReg = registered.find((r) => r.opts.name === "conversation.chat.assistant-actions");
const catalogReg = registered.find((r) => r.opts.name === "settings.plugins.tab");
assert(settingsReg !== undefined && settingsReg.opts.id === "dsh-tools" && settingsReg.opts.order === 35, "settings.section id dsh-tools order 35");
assert(overlayReg !== undefined && overlayReg.opts.id === "dsh-tools-notify", "shell.overlay id dsh-tools-notify");
assert(mdUserReg !== undefined && mdUserReg.opts.priority === -1 && mdUserReg.opts.locale === "conversation", "conversation.chat.node user shadow registered with priority -1");
assert(mdSteeringReg !== undefined && mdSteeringReg.opts.key === "steering" && mdSteeringReg.opts.priority === -1, "conversation.chat.node steering shadow registered with priority -1");
assert(detailsReg !== undefined && detailsReg.opts.priority === -1 && typeof detailsReg.opts.inject === "function", "details entry registered with priority -1 and an inject face");
assert(pinReg !== undefined && pinReg.opts.id === "dsh-tools-pin" && pinReg.opts.order === 5, "assistant-actions pin entry id dsh-tools-pin order 5");
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
	assert(html.includes("DeepSeek Harness 版本"), "harness version card renders inside 功能开关 before config loads");
	assert(html.includes("一键重启"), "always-on restart card renders inside 功能开关 before config loads");
	assert(html.includes("任务完成提示"), "任务完成提示 card renders inside 功能开关 before config loads (授权+开关合一, v0.7.2)");
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
	assert(typeof tabsOf === "function", "test hook exports tabModel");	let tabs = tabsOf(null);
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
			{ key: "notify.task-done", label: "任务完成提示", enabled: true, alwaysOn: false, panel: false },
			{ key: "restart.web", label: "一键重启", enabled: true, alwaysOn: true },
			{ key: "a", label: "功能A", enabled: true },
		],
	});
	assert(tabs.length === 2 && tabs[0].key === "manage" && tabs[1].key === "a", "alwaysOn features get no tab; panel:false optional features (notify.task-done) get no tab either");
	tabs = tabsOf({
		features: [
			{ key: "a", label: "功能A", enabled: true },
			{ key: "catalog", label: "插件分类视图", enabled: true, panel: false },
			{ key: "b", label: "功能B", enabled: true, panel: true },
		],
	});
	assert(tabs.length === 3 && tabs[1].key === "a" && tabs[2].key === "b", "panel:false features get no settings tab; panel:true (and unset) are included");
	tabs = tabsOf({
		features: [
			{ key: "ui.enhance", label: "界面增强", enabled: true, panel: true },
			{ key: "a", label: "功能A", enabled: false },
		],
	});
	assert(tabs.length === 2 && tabs[1].key === "ui.enhance", "enabled panel feature ui.enhance gets its own tab");
	tabs = tabsOf({
		features: [
			{ key: "ui.enhance", label: "界面增强", enabled: false, panel: true },
		],
	});
	assert(tabs.length === 1, "disabled ui.enhance yields no tab");
	tabs = tabsOf({
		features: [
			{ key: "ui.usage", label: "应用用量", enabled: true, panel: true },
			{ key: "a", label: "功能A", enabled: false },
		],
	});
	assert(tabs.length === 2 && tabs[1].key === "ui.usage", "enabled panel feature ui.usage gets its own tab");
	tabs = tabsOf({
		features: [
			{ key: "wechat.openclaw", label: "微信接入（OpenClaw）", enabled: true, panel: true },
			{ key: "a", label: "功能A", enabled: false },
		],
	});
	assert(tabs.length === 2 && tabs[1].key === "wechat.openclaw", "enabled panel feature wechat.openclaw gets its own tab");

	// --- byte-size formatting (v0.7.0 storage display) ---

	const formatBytesFn = captured.__dshToolsTest && captured.__dshToolsTest.formatBytes;
	assert(typeof formatBytesFn === "function", "test hook exports formatBytes");
	assert(formatBytesFn(0) === "0 B", "zero bytes formats as B");
	assert(formatBytesFn(1023) === "1023 B", "bytes under 1 KiB stay in B");
	assert(formatBytesFn(1024) === "1.0 KB", "1 KiB is 1.0 KB");
	assert(formatBytesFn(1536) === "1.5 KB", "fractional KiB formats with one decimal");
	assert(formatBytesFn(1500 * 1024) === "1.5 MB", "MB rounding");
	assert(formatBytesFn(50 * 1024 * 1024) === "50.0 MB", "MB under 100 keeps one decimal");
	assert(formatBytesFn(200 * 1024 * 1024) === "200 MB", "values >= 100 round to integer");
	assert(formatBytesFn(3 * 1024 * 1024 * 1024) === "3.0 GB", "GB scale");
	assert(formatBytesFn(null) === "未知" && formatBytesFn(undefined) === "未知", "unknown sizes render 未知");
	assert(formatBytesFn(-5) === "未知", "negative sizes render 未知");
	assert(formatBytesFn("12") === "未知", "non-number sizes render 未知");

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

	// --- markdown node registration gate (ui.enhance) ---

	const mdReg = captured.__dshToolsTest && captured.__dshToolsTest.markdownNodeRegistration;
	assert(typeof mdReg === "function", "test hook exports markdownNodeRegistration");
	assert(mdReg(null) === true, "null config registers the shadow optimistically");
	assert(mdReg({ features: [] }) === true, "unknown feature registers optimistically");
	assert(mdReg({ features: [{ key: "ui.enhance", enabled: true }] }) === true, "enabled ui.enhance registers the shadow");
	assert(mdReg({ features: [{ key: "ui.enhance", enabled: false }] }) === false, "disabled ui.enhance unregisters the shadow (stock renderer wins)");

	// --- history registration gate + turns model (ui.enhance) ---

	const hsReg = captured.__dshToolsTest && captured.__dshToolsTest.historyRegistration;
	const buildTurnsFn = captured.__dshToolsTest && captured.__dshToolsTest.buildTurns;
	const mergeTurnsFn = captured.__dshToolsTest && captured.__dshToolsTest.mergeVisibleTurns;
	assert(typeof hsReg === "function" && typeof buildTurnsFn === "function" && typeof mergeTurnsFn === "function", "test hooks export history helpers");
	assert(hsReg(null) === true, "null config registers the strip optimistically");
	assert(hsReg({ features: [{ key: "ui.enhance", enabled: false }] }) === false, "disabled ui.enhance unregisters details + pin");

	const fakeSnapshot = {
		order: ["k1", "k2", "k3", "k4"],
		nodes: {
			get: (key) => {
				const rows = {
					k1: { kind: "user", data: { content: [{ type: "text", text: "第一回合问题" }] }, location: { kind: "turn", turn: { turn: 1 } } },
					k2: { kind: "assistant", data: { blocks: [{ kind: "text", text: "助手回答" }] }, location: { kind: "step", turn: { turn: 1 } } },
					k3: { kind: "steering", data: { content: [{ type: "text", text: "steering 提示" }] }, location: { kind: "turn", turn: { turn: 2 } } },
					k4: { kind: "user", data: { content: [{ type: "image" }] }, location: { kind: "turn", turn: { turn: 3 } } },
				};
				return rows[key];
			},
		},
		legacy: { turnTimings: { get: (n) => (n === 1 ? { startTime: 1000 } : undefined) } },
	};
	const turns = buildTurnsFn(fakeSnapshot);
	assert(turns.length === 3, "buildTurns keeps only user/steering nodes");
	assert(turns[0].key === "k1" && turns[0].turn === 1 && turns[0].question === "第一回合问题" && turns[0].time === 1000, "turn carries key/turn/question/time");
	assert(turns[1].key === "k3" && turns[1].turn === 2, "steering nodes become turns");
	assert(turns[2].question === "" && turns[2].time === undefined, "textless turn yields empty preview and no timing");
	const merged = mergeTurnsFn(turns, 1, new Set([2]));
	assert(merged.length === 2 && merged[0].key === "k3" && merged[1].key === "k4", "limit keeps the recent turn and merges pinned back in window order");
	const mergedAll = mergeTurnsFn(turns, 0, new Set());
	assert(mergedAll.length === 3, "zero limit shows all turns");
	const mergedPinned = mergeTurnsFn(turns, 1, new Set([99]));
	assert(mergedPinned.length === 1 && mergedPinned[0].key === "k4", "absent pinned numbers are ignored (recent turn kept)");

	// --- usage aggregation pure functions (ui.usage) ---

	const decodeRow = captured.__dshToolsTest && captured.__dshToolsTest.decodeUsageRow;
	const aggregateFn = captured.__dshToolsTest && captured.__dshToolsTest.aggregateUsage;
	const bucketFn = captured.__dshToolsTest && captured.__dshToolsTest.usageByBucket;
	const modelKeysFn = captured.__dshToolsTest && captured.__dshToolsTest.usageModelKeys;
	const fmtTokens = captured.__dshToolsTest && captured.__dshToolsTest.formatTokens;
	const fmtDuration = captured.__dshToolsTest && captured.__dshToolsTest.formatDuration;
	const rangeWindowFn = captured.__dshToolsTest && captured.__dshToolsTest.rangeWindow;
	const hitRateFn = captured.__dshToolsTest && captured.__dshToolsTest.usageHitRate;
	const costFn = captured.__dshToolsTest && captured.__dshToolsTest.estimateUsageCost;
	const sessionMetricsFn = captured.__dshToolsTest && captured.__dshToolsTest.sessionUsageMetrics;
	const fmtPrice = captured.__dshToolsTest && captured.__dshToolsTest.formatPrice;
	const fmtBucketTooltip = captured.__dshToolsTest && captured.__dshToolsTest.formatBucketTooltip;
	assert(typeof decodeRow === "function" && typeof aggregateFn === "function" && typeof bucketFn === "function" && typeof modelKeysFn === "function" && typeof fmtTokens === "function" && typeof fmtDuration === "function" && typeof rangeWindowFn === "function" && typeof hitRateFn === "function" && typeof costFn === "function" && typeof sessionMetricsFn === "function" && typeof fmtPrice === "function" && typeof fmtBucketTooltip === "function", "test hooks export usage helpers");

	const NOW = Date.now();
	const ROW = decodeRow(NOW, {
		tokenUsage: {
			uncachedInputTokens: 100, outputTokens: 50, cacheReadTokens: 30, cacheWriteTokens: 20,
			byModel: { "deepseek:chat": { uncachedInputTokens: 60, outputTokens: 30, cacheReadTokens: 10, cacheWriteTokens: 5 } },
		},
		sessionStats: { turns: 3, steps: 7, llmMs: 120000, toolMs: 4000 },
	});
	assert(ROW.usage !== null && ROW.usage.uncachedInputTokens === 100, "decodeUsageRow reads the tokenUsage projection");
	assert(ROW.byModel !== null && ROW.byModel["deepseek:chat"].outputTokens === 30, "decodeUsageRow reads per-model buckets");
	assert(ROW.stats !== null && ROW.stats.turns === 3 && ROW.stats.llmMs === 120000, "decodeUsageRow reads sessionStats");
	const lenient = decodeRow(NOW, undefined);
	assert(lenient.usage === null && lenient.byModel === null && lenient.stats === null, "missing projection decodes leniently");
	assert(modelKeysFn([ROW])[0] === "deepseek:chat", "usageModelKeys collects provider:model keys");
	const agg = aggregateFn([ROW], "week", NOW, null);
	assert(agg.sessions === 1 && agg.inputTokens === 100 && agg.outputTokens === 50 && agg.cacheReadTokens === 30 && agg.steps === 7 && agg.llmMs === 120000, "aggregateUsage sums the row in window");
	const aggOld = aggregateFn([ROW], "days3", NOW + 10 * 86400000, null);
	assert(aggOld.sessions === 0, "aggregateUsage drops rows outside the window");
	const aggModel = aggregateFn([ROW], "week", NOW, "deepseek:chat");
	assert(aggModel.inputTokens === 60 && aggModel.cacheReadTokens === 10, "model filter aggregates the model bucket only");
	const aggMissing = aggregateFn([ROW], "week", NOW, "other:model");
	assert(aggMissing.sessions === 0, "model filter skips sessions that never used the model");
	const buckets = bucketFn([ROW], "week", NOW, null);
	assert(buckets.length === 7 && buckets.some((b) => b.tokens > 0), "usageByBucket yields 7 daily buckets with the row inside");
	const lastBucket = buckets[buckets.length - 1];
	assert(lastBucket.sessions === 1 && lastBucket.inputTokens === 100 && lastBucket.cacheReadTokens === 30 && Math.abs(lastBucket.hitRate - 30 / 130) < 1e-12, "usageByBucket enriches buckets with breakdown and hit rate");
	const weekWin = rangeWindowFn("week", NOW);
	assert(weekWin.end - weekWin.start === 7 * 86400000 - 1, "week window is calendar-aligned across 7 days");
	const weekTooltipFirst = fmtBucketTooltip(lastBucket).split("\n")[0];
	assert(!weekTooltipFirst.includes(" - "), "week daily bucket tooltip is a single calendar day");
	const yearBuckets = bucketFn([ROW], "year", NOW, null);
	assert(yearBuckets.length === new Date(NOW).getMonth() + 1, "year range yields calendar months up to the current month");
	const monthBuckets = bucketFn([ROW], "month", NOW, null);
	assert(monthBuckets.length >= 1 && monthBuckets.length <= 5, "month range yields weekly buckets from month start");
	assert(fmtTokens(1200) === "1.2k" && fmtTokens(3400000) === "3.40M" && fmtTokens(999) === "999", "formatTokens compacts k/M");
	assert(fmtDuration(45000) === "45s" && fmtDuration(750000) === "12m 30s" && fmtDuration(3.2 * 3600000) === "3h 12m", "formatDuration compacts durations");

	const CUSTOM = { mode: "custom", start: "2026-01-01", end: "2026-01-03" };
	const customWin = rangeWindowFn(CUSTOM, NOW);
	assert(customWin.start === new Date(2026, 0, 1).getTime() && customWin.end === new Date(2026, 0, 3).getTime() + 86400000 - 1, "rangeWindow builds an absolute custom day window");
	const customRow = Object.assign({}, ROW, { updatedAt: new Date(2026, 0, 2).getTime() });
	const customBuckets = bucketFn([customRow], CUSTOM, NOW, null);
	assert(customBuckets.length === 3 && customBuckets[1].sessions === 1 && customBuckets[1].tokens === 200, "custom range buckets by day and carry session data");
	const aggCustom = aggregateFn([customRow], CUSTOM, NOW, null);
	assert(aggCustom.sessions === 1 && aggCustom.inputTokens === 100, "aggregateUsage honors custom date windows");

	const PRICING_CFG = {
		pricing: {
			"deepseek:chat": { input: 2, cacheRead: 0.5, cacheWrite: 2, output: 8 },
			default: { input: 1, cacheRead: 0.2, cacheWrite: 1, output: 4 },
		},
		priceMode: "offPeak",
	};
	assert(hitRateFn(ROW.usage) === 30 / 130, "usageHitRate computes cache read over total input");
	const cost = costFn(ROW, "deepseek:chat", PRICING_CFG);
	assert(cost !== null && Math.abs(cost - 0.000375) < 1e-12, "estimateUsageCost prices a model bucket in yuan");
	const metrics = sessionMetricsFn(ROW, null, PRICING_CFG);
	assert(metrics.tokens === 200 && Math.abs(metrics.hitRate - 30 / 130) < 1e-12 && Math.abs(metrics.cost - 0.000375) < 1e-12, "sessionUsageMetrics returns tokens, hit rate and cost");
	const noModelRow = decodeRow(NOW, { tokenUsage: { uncachedInputTokens: 1000, outputTokens: 500, cacheReadTokens: 200, cacheWriteTokens: 100 } });
	const defaultCost = costFn(noModelRow, null, PRICING_CFG);
	assert(defaultCost !== null && defaultCost > 0, "estimateUsageCost falls back to default pricing when byModel is absent");
	const legacyCfg = { pricing: { "deepseek:chat": { input: 2, cacheRead: 0.5, cacheWrite: 2, output: 8 } }, priceMode: "offPeak" };
	const legacyCost = costFn(noModelRow, null, legacyCfg);
	assert(legacyCost !== null && legacyCost > 0, "estimateUsageCost injects default fallback for legacy pricing configs");
	const multiModelRow = decodeRow(NOW, {
		tokenUsage: {
			uncachedInputTokens: 1000, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0,
			byModel: {
				"deepseek:flash": { uncachedInputTokens: 600, outputTokens: 60, cacheReadTokens: 0, cacheWriteTokens: 0 },
				"deepseek:pro": { uncachedInputTokens: 400, outputTokens: 40, cacheReadTokens: 0, cacheWriteTokens: 0 },
			},
		},
	});
	const multiCfg = {
		pricing: {
			"deepseek:flash": { input: 1, cacheRead: 0, cacheWrite: 0, output: 2 },
			"deepseek:pro": { input: 3, cacheRead: 0, cacheWrite: 0, output: 4 },
		},
		priceMode: "offPeak",
	};
	const multiCost = costFn(multiModelRow, null, multiCfg);
	const multiExpected = (600 * 1 + 60 * 2 + 400 * 3 + 40 * 4) / 1000000;
	assert(multiCost !== null && Math.abs(multiCost - multiExpected) < 1e-12, "estimateUsageCost sums per-model prices");
	assert(fmtPrice(0.000375) === "¥0.0004" && fmtPrice(null) === "—" && fmtPrice(0) === "¥0.00", "formatPrice formats yuan estimates");
	const tooltip = fmtBucketTooltip(lastBucket);
	assert(tooltip.includes("总 Token") && tooltip.includes("命中率") && tooltip.includes("会话数") && tooltip.includes("费用") && !tooltip.includes("缓存写"), "formatBucketTooltip includes detailed bucket data and cost, omits cache write");

	// --- usage panel data path (Bug 1 regression: useSessions must flow from
	// the settings.section runtime prop, NOT ctx.sessions.list which is a
	// SnapshotStore object and never callable as a hook) ---

	const UsagePanelCmp = captured.__dshToolsTest && captured.__dshToolsTest.UsagePanel;
	assert(typeof UsagePanelCmp === "function", "test hook exports UsagePanel");
	if (serverRender !== undefined) {
		const usageEmptyHtml = serverRender(React.createElement(UsagePanelCmp, { useSessions: undefined }));
		assert(usageEmptyHtml.includes("正在加载用量数据") || usageEmptyHtml.includes("暂无用量数据"), "usage panel without a sessions hook renders loading/empty state (no crash)");
		const usageFakeHook = (selector) => selector({
			byId: {
				"s1": {
					displayTitle: "用量测试会话",
					updatedAt: Date.now(),
					projectionValues: {
						tokenUsage: { uncachedInputTokens: 1000, outputTokens: 500, cacheReadTokens: 200, cacheWriteTokens: 100 },
						sessionStats: { turns: 2, steps: 5, llmMs: 60000, toolMs: 3000 },
					},
				},
			},
		});
		const usageDataHtml = serverRender(React.createElement(UsagePanelCmp, { useSessions: usageFakeHook }));
		assert(usageDataHtml.includes("用量测试会话"), "usage panel renders session data when useSessions flows through the prop");
		assert(usageDataHtml.includes("1.0k"), "usage panel renders formatted token KPIs from projection data");
		assert(usageDataHtml.includes("自定义"), "usage panel shows the custom date tab");
		assert(usageDataHtml.includes("费用"), "usage panel shows the estimated cost KPI");
		assert(usageDataHtml.includes("命中率"), "usage panel shows hit rate in the session table");
		assert(usageDataHtml.includes("价格配置"), "usage panel shows the price config entry");
	}
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

	// --- DeepSeek Harness 版本检查 auto-check decision (pure function) ---

	const decideHarness = captured.__dshToolsTest && captured.__dshToolsTest.harnessCheckDecision;
	assert(typeof decideHarness === "function", "test hook exports harnessCheckDecision");
	assert(decideHarness({ autoChecked: false, inFlight: false, data: null }) === "check", "first open after page load runs the harness check");
	assert(decideHarness({ autoChecked: true, inFlight: false, data: { current: "0.1.0-rc.7", latest: "" } }) === "restore", "later opens restore the cached harness result without a request");
	assert(decideHarness({ autoChecked: true, inFlight: true, data: null }) === "wait", "an in-flight harness check is not duplicated");
	assert(decideHarness(undefined) === "check" && decideHarness(null) === "check", "missing harness store falls back to checking");

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
