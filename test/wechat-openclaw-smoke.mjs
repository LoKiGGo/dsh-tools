/**
 * dsh-tools — wechat.openclaw smoke test (no real WeChat account).
 *
 * Covers the pure logic that can run without a DSH profile:
 *   - allowlist normalization / matching
 *   - login session state machine primitives
 *   - feature module metadata
 *
 * Run:  node test/wechat-openclaw-smoke.mjs
 */

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeAllowFrom, isAllowed } from "../lib/wechat/allowlist.js";
import { createLoginSession, submitVerifyCode, cancelLogin, loginSnapshot } from "../lib/wechat/login.js";
import { runWeixinGateway, shouldUseModlensFallback } from "../lib/wechat/gateway.js";
import { askAgentStreaming, applyStreamChunk } from "../lib/wechat/vendor/bridge.js";
import { saveWechatMedia } from "../lib/wechat/media-store.js";
import { AI_CAPABILITIES } from "../lib/wechat/vendor/weixin/ai-config.js";
import * as feature from "../lib/features/wechat-openclaw.js";

// --- allowlist ---
assert.deepEqual(normalizeAllowFrom([" a ", "", "a", "b", " b "]), ["a", "b"]);
assert.equal(isAllowed([], "wxid_1"), false);
assert.equal(isAllowed(["wxid_1"], "wxid_1"), true);
assert.equal(isAllowed(["wxid_1"], " wxid_1 "), true);
assert.equal(isAllowed(["wxid_1"], "wxid_2"), false);
assert.equal(isAllowed(["wxid_1"], ""), false);

// --- modlens fallback decision ---
assert.equal(shouldUseModlensFallback(true, ["modlens_read_image"]), false);
assert.equal(shouldUseModlensFallback(false, ["modlens_read_image"]), true);
assert.equal(shouldUseModlensFallback(false, ["bash"]), false);
assert.equal(shouldUseModlensFallback(false, []), false);
assert.equal(shouldUseModlensFallback(false, null), false);

// --- media storage ---
const mediaTmp2 = mkdtempSync(join(tmpdir(), "dsh-wx-store-"));
const oldState2 = process.env.OPENCLAW_STATE_DIR;
process.env.OPENCLAW_STATE_DIR = mediaTmp2;
const saved = await saveWechatMedia(
	Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
	undefined,
	"inbound",
	0,
	"test.png",
);
assert.equal(saved.path.includes(join("inbound", "images")), true, "image saved under inbound/images");
assert.equal(saved.path.includes(join("inbound", "inbound")), false, "no inbound/inbound nesting");
process.env.OPENCLAW_STATE_DIR = oldState2;

// --- login session primitives ---
const session = createLoginSession();
assert.equal(session.status, "idle");
assert.equal(session.sessionKey.length > 0, true);

assert.deepEqual(submitVerifyCode(session, ""), { ok: false, message: "配对码不能为空" });
assert.deepEqual(submitVerifyCode(session, "123456"), { ok: true });
assert.equal(session.pendingVerifyCode, "123456");
assert.equal(session.awaitingVerifyCode, false);

cancelLogin(session);
assert.equal(session.status, "cancelled");
assert.equal(session.aborted, true);

const snap = loginSnapshot(session);
assert.equal(snap.status, "cancelled");
assert.equal("token" in snap, false);
assert.equal("qrcode" in snap, false);

// --- feature metadata ---
assert.equal(feature.key, "wechat.openclaw");
assert.equal(feature.defaultEnabled, false);
assert.equal(feature.alwaysOn, false);
assert.equal(feature.panel, true);
assert.equal(feature.label.includes("微信"), true);
assert.equal(Array.isArray(feature.defaultConfig.allowFrom), true);
assert.equal(feature.defaultConfig.sessionMode, "room");
assert.equal(typeof runWeixinGateway, "function", "gateway module loads with DSH dev deps");
const visionDef = AI_CAPABILITIES.find((d) => d.id === "vision");
assert.equal(visionDef?.defaultModel, "deepseek-v4-flash-vision-exp");


// --- feature route registration (no DSH agent services needed) ---
const routes = [];
const fakeCtx = {
	webServer: {
		register: (route) => {
			routes.push(route);
			return () => {};
		},
	},
};
let lastPayload = {};
const fakeApi = {
	config: () => ({ features: [], featureConfig: { [feature.key]: {} } }),
	fence: () => true,
	writeOk: (res, value) => { res.body = { ok: true, value }; },
	writeError: (res, code, message, status = 500) => { res.body = { ok: false, error: { code, message }, status }; },
	readJsonBody: async () => lastPayload,
	log: () => {},
};
const disposer = feature.register(fakeCtx, fakeApi);
const wechatRoute = routes.find((r) => r.path !== undefined && String(r.path).includes("wechat.openclaw"));
assert(wechatRoute !== undefined, "wechat.openclaw route registered");

const statusRes = {};
lastPayload = {};
await wechatRoute.handler(
	{ method: "POST", url: "/dsh-tools/wechat.openclaw/api/status", headers: { host: "127.0.0.1:3080" } },
	statusRes,
);
assert.equal(statusRes.body.ok, true);
assert.equal(statusRes.body.value.gatewayState, "stopped");
assert.equal(Array.isArray(statusRes.body.value.accounts), true);
assert.equal(Array.isArray(statusRes.body.value.recentSenders), true);

// Slash-containing methods must be accepted (login/start etc. are not "unknown").
const pollRes = {};
lastPayload = { sessionKey: "" };
await wechatRoute.handler(
	{ method: "POST", url: "/dsh-tools/wechat.openclaw/api/login/poll", headers: { host: "127.0.0.1:3080" } },
	pollRes,
);
assert.equal(pollRes.body.ok, true);
assert.equal(pollRes.body.value.ok, false);
assert.equal(pollRes.body.value.error, "login-not-found");

// account/logout with missing accountId is handled (not unknown method).
const logoutRes = {};
lastPayload = {};
await wechatRoute.handler(
	{ method: "POST", url: "/dsh-tools/wechat.openclaw/api/account/logout", headers: { host: "127.0.0.1:3080" } },
	logoutRes,
);
assert.equal(logoutRes.body.ok, true);
assert.equal(logoutRes.body.value.ok, false);
assert.equal(logoutRes.body.value.error, "missing-account");

// media/list returns cached files under the configured state dir.
const mediaTmp = mkdtempSync(join(tmpdir(), "dsh-wx-media-"));
const mediaDir = join(mediaTmp, "weixin-dsh", "media", "inbound", "images");
mkdirSync(mediaDir, { recursive: true });
writeFileSync(join(mediaDir, "a.png"), "x");
const oldState = process.env.OPENCLAW_STATE_DIR;
process.env.OPENCLAW_STATE_DIR = mediaTmp;
const mediaRes = {};
lastPayload = {};
await wechatRoute.handler(
	{ method: "POST", url: "/dsh-tools/wechat.openclaw/api/media/list", headers: { host: "127.0.0.1:3080" } },
	mediaRes,
);
assert.equal(mediaRes.body.ok, true);
assert.equal(Array.isArray(mediaRes.body.value), true);
assert.equal(mediaRes.body.value.length, 1);
const mediaDirEntry = mediaRes.body.value[0];
assert.equal(mediaDirEntry.name, "media");
assert.equal(mediaDirEntry.fileCount, 1);
assert.equal(mediaDirEntry.size, 1);
process.env.OPENCLAW_STATE_DIR = oldState;

// ai/config with missing capabilities is handled (not unknown method).
const aiRes = {};
lastPayload = {};
await wechatRoute.handler(
	{ method: "POST", url: "/dsh-tools/wechat.openclaw/api/ai/config", headers: { host: "127.0.0.1:3080" } },
	aiRes,
);
assert.equal(aiRes.body.ok, true);
assert.equal(aiRes.body.value.ok, false);
assert.equal(aiRes.body.value.error, "bad-request");
disposer();

// --- bridge streaming channels ---
// 0.1.3-alpha.1 起宿主移除了顶层 assistant/chunk 会话事件，实时增量改由
// agent/assistant-stream 帧发布；两个通道都必须喂出文本，且一个增量都没有时
// 必须整段兜底（否则微信 gateway 只从 onDelta 取文本 → 回复静默为空）。
const assistantMessage = (text) => ({
	seq: 2,
	type: "assistant/message",
	data: { message: { content: [{ type: "text", text }] }, usage: { inputTokens: 1, outputTokens: 1 } },
});
function makeFakeHandle(events, script) {
	const listeners = new Map();
	const emit = (name, ...args) => {
		for (const callback of [...(listeners.get(name) ?? [])]) callback(...args);
	};
	const agent = {
		session: { seq: 0, snapshotEvents: () => events },
		ctx: {
			on: (name, callback) => {
				const list = listeners.get(name) ?? [];
				list.push(callback);
				listeners.set(name, list);
				return () => {
					const current = listeners.get(name) ?? [];
					const index = current.indexOf(callback);
					if (index >= 0) current.splice(index, 1);
				};
			},
		},
		followup: () => { script?.(emit); },
		whenIdle: async () => {},
	};
	return { agent, listenerCount: (name) => (listeners.get(name) ?? []).length };
}

// v2 通道：agent/assistant-stream 帧
const v2Handle = makeFakeHandle([{ seq: 1, type: "turn/start" }, assistantMessage("你好世界")], (emit) => {
	emit("agent/assistant-stream", { agent: v2Handle.agent, frame: { type: "start" } });
	emit("agent/assistant-stream", { agent: v2Handle.agent, frame: { type: "chunk", chunk: { type: "text-delta", text: "你好" } } });
	emit("agent/assistant-stream", { agent: v2Handle.agent, frame: { type: "chunk", chunk: { type: "text-delta", text: "世界" } } });
	emit("agent/assistant-stream", { agent: v2Handle.agent, frame: { type: "end", outcome: { kind: "committed" } } });
});
const v2Deltas = [];
let v2TurnStarts = 0;
const v2Result = await askAgentStreaming(v2Handle, "hi", {
	onDelta: (delta) => v2Deltas.push(delta),
	onTurnStart: () => { v2TurnStarts += 1; },
});
assert.deepEqual(v2Deltas, ["你好", "世界"], "assistant-stream frames deliver deltas");
assert.equal(v2TurnStarts, 1, "frame start maps to onTurnStart");
assert.equal(v2Result.text, "你好世界", "summarize still reads the durable assistant/message");
assert.equal(v2Handle.listenerCount("agent/assistant-stream"), 0, "frame subscription disposed after ask");
assert.equal(v2Handle.listenerCount("session/event"), 0, "legacy subscription disposed after ask");

// 旧通道：session/event 的 assistant/chunk 信封仍可用（<= 0.1.2 宿主）
const legacyHandle = makeFakeHandle([{ seq: 1, type: "turn/start" }, assistantMessage("旧宿主回复")], (emit) => {
	emit("session/event", null, { seq: 1, type: "assistant/chunk", data: { chunk: { type: "text-delta", text: "旧" } } });
});
const legacyDeltas = [];
await askAgentStreaming(legacyHandle, "hi", { onDelta: (delta) => legacyDeltas.push(delta) });
assert.deepEqual(legacyDeltas, ["旧"], "legacy assistant/chunk envelope still feeds deltas");

// 兜底：两个通道都没有增量时，整段聚合文本仍要交给调用方
const silentHandle = makeFakeHandle([{ seq: 1, type: "turn/start" }, assistantMessage("完整回复")]);
const silentDeltas = [];
const silentResult = await askAgentStreaming(silentHandle, "hi", { onDelta: (delta) => silentDeltas.push(delta) });
assert.deepEqual(silentDeltas, ["完整回复"], "no published delta falls back to the aggregated reply");
assert.equal(silentResult.text, "完整回复");

// applyStreamChunk 同时接受帧内原始 chunk 与旧信封
const chunkState = { blockHadDelta: false };
assert.equal(applyStreamChunk({ type: "assistant/chunk", data: { chunk: { type: "text-delta", text: "a" } } }, chunkState), "a");
assert.equal(applyStreamChunk({ type: "text-delta", text: "b" }, chunkState), "b");
assert.equal(applyStreamChunk({ type: "block-end", block: { type: "text", text: "c" } }, { blockHadDelta: false }), "c");
assert.equal(applyStreamChunk({ type: "text-delta" }, chunkState), undefined);
assert.equal(applyStreamChunk(null, chunkState), undefined);

// --- generate_image 工具定义形状（回归：宿主 tools.register 契约）---
// 宿主强制要求 output{schema,render}，且 parameters 必须是「紧凑参数表」而不是
// 已编译的 JSON Schema；形状不符时 register() 抛错、被 try/catch 静默吞掉，
// 表现为工具凭空消失。这里走真实的 register() 路径并用假 tools 截获定义。
// 只需预置 env 即可让 image 能力判定为已配置（loadEnvFile 不覆盖已存在的变量）。
process.env.AI_IMAGE_BASE_URL = "https://example.invalid/v1";
process.env.AI_IMAGE_KEY = "sk-test";
const captured = [];
const noopDisposer = () => {};
const toolCtx = {
	get: (service) => (service === "tools" ? { register: (definition) => { captured.push(definition); return noopDisposer; } } : undefined),
	effect: (fn) => { const d = fn(); return typeof d === "function" ? d : noopDisposer; },
	on: () => noopDisposer,
	webServer: { register: () => noopDisposer },
};
const toolApi = {
	log: () => {},
	config: () => ({ features: { "wechat.openclaw": true }, featureConfig: {} }),
	featureEnabled: () => true,
	broadcast: () => {},
	fence: () => true,
	writeOk: () => {},
	writeError: () => {},
	readJsonBody: async () => ({}),
};
feature.register(toolCtx, toolApi);

assert.equal(captured.length, 1, "image 能力已配置时应恰好注册 generate_image 一个工具");
const tool = captured[0];
assert.equal(tool.name, "generate_image");
assert.equal(typeof tool.description, "string", "工具必须有 description");
assert.equal(typeof tool.execute, "function", "工具必须有 execute");

// 形状断言：parameters 必须是编译后的 JSON Schema（由 defineTool 生成）
assert.deepEqual(tool.parameters, {
	type: "object",
	properties: { prompt: { type: "string", description: "图片内容描述（中文）" } },
	required: ["prompt"],
});
// 关键回归点：output{schema,render} 必须存在，否则宿主 register() 抛 TypeError
assert.notEqual(tool.output, undefined, "工具定义必须带 output（宿主强制）");
assert.equal(typeof tool.output.render, "function", "output.render 必须是函数（宿主强制）");
assert.deepEqual(tool.output.schema, { type: "string" }, "output.schema 必须是 {type:'string'}");
const rendered = tool.output.render({ prompt: "一只猫" }, "C:/tmp/cat.png");
assert.equal(Array.isArray(rendered), true, "render 必须返回内容块数组");
assert.equal(rendered[0].text.includes("图片已生成"), true, "render 文案应包含图片路径提示");

// 回归点：用宿主导出的原语复刻 register() 的守卫，验证「提交的定义真能过闸」，
// 并且旧写法仍然过不了 —— 否则本用例失去意义。
// 宿主 register() 的守卫（0.2.0-rc.2）：要求 output 为对象且 output.render 是函数，
// 再对 output.schema 调 assertSupportedJsonSchema；parameters 侧由 defineTool 编译。
{
	let defineTool;
	let validateArgs;
	let validateJsonSchemaValue;
	let assertSupportedJsonSchema;
	try {
		({ defineTool, validateArgs, validateJsonSchemaValue, assertSupportedJsonSchema } = await import("@deepseek-ai/dsh-tools"));
	} catch {
		defineTool = undefined; // 宿主包不可用时跳过契约校验（上面的结构断言已覆盖）
	}
	if (typeof defineTool === "function") {
		// 1) 提交的定义必须通过宿主守卫（这一步就是过去抛 TypeError 的地方）
		assert.equal(typeof tool.output?.render, "function", "提交的定义必须满足 output.render 守卫");
		assert.doesNotThrow(() => assertSupportedJsonSchema(tool.output.schema), "提交的 output.schema 必须被宿主接受");

		// 2) 参数校验：新形状合法、缺参报错
		const paramsSpec = { prompt: { type: "string", required: true, description: "图片内容描述（中文）" } };
		assert.deepEqual(validateArgs(paramsSpec, { prompt: "一只猫" }), [], "紧凑参数表应接受合法参数");
		assert.equal(validateArgs(paramsSpec, {}).length > 0, true, "缺少必填 prompt 应报错");
		assert.equal(validateArgs(paramsSpec, { prompt: 123 }).length > 0, true, "参数类型错误应报错");

		// 3) 输出校验：字符串通过、非字符串拒绝
		assert.deepEqual(validateJsonSchemaValue(tool.output.schema, "C:/tmp/cat.png", "value"), [], "output.schema 应接受字符串结果");
		assert.equal(validateJsonSchemaValue(tool.output.schema, 42, "value").length > 0, true, "output.schema 应拒绝非字符串结果");

		// 4) 负向对照：旧写法（裸 JSON Schema + 无 output）必须仍然过不了闸
		const oldShapeParameters = { type: "object", properties: { prompt: { type: "string" } }, required: ["prompt"] };
		assert.throws(
			() => validateArgs(oldShapeParameters, { prompt: "x" }),
			/unsupported JSON schema|must be a value schema object/,
			"旧 parameters 形状（裸 JSON Schema）应被宿主拒绝 —— 这正是本回归的根因",
		);

		// 5) 真实定义可被 defineTool 重新构造出等价形状（两侧同源，防手工漂移）
		const rebuilt = defineTool({
			name: "generate_image",
			description: "x",
			parameters: paramsSpec,
			output: { schema: { type: "string" }, render: (_a, v) => [{ type: "text", text: String(v) }] },
			execute: async () => "x",
		});
		assert.deepEqual(rebuilt.parameters, tool.parameters, "defineTool 编译出的 parameters 应与真实定义一致");
		assert.deepEqual(rebuilt.output.schema, tool.output.schema, "defineTool 编译出的 output.schema 应与真实定义一致");
	}
}

console.log("wechat-openclaw-smoke: PASS");
