/**
 * Feature: wechat.openclaw — 微信接入（OpenClaw/iLink）。
 *
 * 复用腾讯 openclaw-weixin / iLink 协议层，在 web profile 内提供：
 *   - 扫码登录（API 驱动，二维码 data URL 返回给设置页）
 *   - 微信账号管理 / 状态
 *   - 文本双向聊天网关（AgentBridge → DSH Agent）
 *   - 白名单、会话模式等基础配置
 *
 * 网关逻辑在 lib/wechat/gateway.js（从 dsh-weixin-gateway 裁剪并加白名单），
 * 登录状态机在 lib/wechat/login.js。为避免在纯 Node 工作区加载时解析
 * @deepseek-ai/dsh-agent 等 profile 运行时依赖，gateway 采用动态 import。
 */

import { existsSync, readdirSync, readFileSync, statSync, rmSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import QRCode from "qrcode";
import {
	listIndexedWeixinAccountIds,
	loadWeixinAccount,
	clearWeixinAccount,
	unregisterWeixinAccountId,
} from "dsh-weixin-gateway/lib/weixin/accounts.js";
import { acquireRunLock, releaseRunLock } from "dsh-weixin-gateway/lib/weixin/run-lock.js";
import {
	getCapabilityConfig,
	applyAiEnvAnswers,
	writeEnvFile,
	reloadAiEnv,
	envPath,
} from "dsh-weixin-gateway/lib/weixin/ai-config.js";
import { resolveStateDir } from "dsh-weixin-gateway/lib/weixin/storage/state-dir.js";
import {
	createLoginSession,
	beginLogin,
	watchLogin,
	submitVerifyCode,
	cancelLogin,
	loginSnapshot,
} from "../wechat/login.js";
import { normalizeAllowFrom } from "../wechat/allowlist.js";

export const key = "wechat.openclaw";
export const label = "微信接入（OpenClaw）";
export const description = "扫码绑定微信，通过腾讯 openclaw-weixin/iLink 协议与 DSH Agent 文字聊天";
export const defaultEnabled = false;
export const alwaysOn = false;
export const kind = "feature";
export const panel = true;

export const defaultConfig = {
	allowFrom: [],
	sessionMode: "room",
	accountId: "",
	autoStart: false,
	maxMessageChars: 2000,
	sendChunkDelayMs: 1500,
};

const DEFAULT_BASE_URL = "https://ilinkai.weixin.qq.com";
const DEFAULT_CDN_BASE_URL = "https://novac2c.cdn.weixin.qq.com/c2c";

/** Resolve account locally (no dependency on dsh-weixin-gateway/driver.js). */
function resolveAccountLocal(accountId) {
	const stored = loadWeixinAccount(accountId);
	return {
		accountId,
		baseUrl: stored?.baseUrl?.trim() || DEFAULT_BASE_URL,
		token: stored?.token?.trim() || undefined,
		cdnBaseUrl: DEFAULT_CDN_BASE_URL,
	};
}

function latestAccountId() {
	const ids = listIndexedWeixinAccountIds();
	return ids.length > 0 ? ids[ids.length - 1] : "";
}

function featureConfigOf(api) {
	const cfg = api.config();
	const value = cfg?.featureConfig?.[key];
	return value !== null && typeof value === "object" ? value : {};
}

export function register(ctx, api) {
	const state = {
		loginSessions: new Map(),
		gatewayState: "stopped",
		gatewayAccountId: null,
		abortController: null,
		gatewayPromise: null,
		lastError: "",
		recentSenders: [],
	};
	const disposers = [];

	/** Record a sender seen by the gateway (for the settings-page hint). */
	function recordSender(userId, info) {
		const list = state.recentSenders.filter((item) => item.userId !== userId);
		list.unshift({ userId, allowed: info.allowed === true, at: info.at || Date.now() });
		state.recentSenders = list.slice(0, 20);
	}

	function mediaRoot() {
		return join(resolveStateDir(), "weixin-dsh", "media");
	}

	function mediaTypeOf(name) {
		const lower = String(name).toLowerCase();
		if (/\.(png|jpe?g|gif|webp|heic|bmp)$/.test(lower)) return "image";
		if (/\.(mp4|mov|avi|mkv|webm)$/.test(lower)) return "video";
		if (/\.(silk|wav|mp3|m4a|amr|ogg)$/.test(lower)) return "audio";
		return "file";
	}

	function handleMediaList() {
		const root = mediaRoot();
		const files = [];
		const pushFile = (full) => {
			try {
				const stat = statSync(full);
				if (!stat.isFile()) return;
				files.push({
					path: full,
					name: full.slice(full.lastIndexOf(sep) + 1),
					size: stat.size,
					mtime: stat.mtimeMs,
					type: mediaTypeOf(full),
				});
			} catch {}
		};
		if (existsSync(root)) {
			for (const entry of readdirSync(root, { withFileTypes: true })) {
				const full = join(root, entry.name);
				if (entry.isFile()) pushFile(full);
				else if (entry.isDirectory() && entry.name === "generated") {
					for (const sub of readdirSync(full, { withFileTypes: true })) {
						if (sub.isFile()) pushFile(join(full, sub.name));
					}
				}
			}
		}
		files.sort((a, b) => b.mtime - a.mtime);
		return files.slice(0, 100);
	}

	function handleMediaClean() {
		for (const root of [mediaRoot(), join(mediaRoot(), "generated")]) {
			if (!existsSync(root)) continue;
			for (const entry of readdirSync(root, { withFileTypes: true })) {
				try {
					rmSync(join(root, entry.name), { recursive: true, force: true });
				} catch {}
			}
		}
		return { ok: true };
	}

	async function handleMediaOpen(payload) {
		const raw = String(payload?.path ?? "");
		if (raw === "") return { ok: false, error: "bad-request", message: "缺少 path" };
		const root = resolve(mediaRoot());
		const target = resolve(raw);
		if (target !== root && !target.startsWith(root + sep)) {
			return { ok: false, error: "outside-cache", message: "路径不在媒体缓存目录内" };
		}
		if (!existsSync(target)) return { ok: false, error: "not-found", message: "文件不存在" };
		const folder = statSync(target).isDirectory() ? target : dirname(target);
		const subprocess = ctx.get("subprocess");
		if (subprocess === undefined) return { ok: false, error: "subprocess-unavailable" };
		let exe = "explorer.exe";
		try {
			exe = await subprocess.resolveExecutable("explorer.exe");
		} catch {}
		try {
			const handle = subprocess.spawn({
				argv: [exe, folder],
				stdio: { stdin: "ignore", stdout: { maxBytes: 1024 }, stderr: { maxBytes: 1024 } },
				graceMs: 10000,
			});
			await handle.done;
			return { ok: true };
		} catch (error) {
			return { ok: false, error: "open-failed", message: error instanceof Error ? error.message : String(error) };
		}
	}

	function handleAiConfig(payload) {
		const capabilities = payload?.capabilities;
		if (capabilities === null || typeof capabilities !== "object") {
			return { ok: false, error: "bad-request", message: "缺少 capabilities" };
		}
		const answers = {};
		for (const id of ["asr", "vision", "image"]) {
			const cap = capabilities[id];
			if (cap === null || typeof cap !== "object") continue;
			if (typeof cap.baseUrl === "string" && cap.baseUrl.trim() !== "") answers[`${id}.url`] = cap.baseUrl.trim();
			if (typeof cap.apiKey === "string" && cap.apiKey.trim() !== "") answers[`${id}.key`] = cap.apiKey.trim();
			if (typeof cap.model === "string" && cap.model.trim() !== "") answers[`${id}.model`] = cap.model.trim();
		}
		let existing = "";
		try {
			if (existsSync(envPath())) existing = readFileSync(envPath(), "utf8");
		} catch {}
		const next = applyAiEnvAnswers(existing, answers);
		if (!writeEnvFile(next)) {
			return { ok: false, error: "write-failed", message: "写入 .env 失败" };
		}
		reloadAiEnv();
		return { ok: true };
	}

	async function handleLoginStart(payload) {
		const session = createLoginSession(payload?.accountId || "");
		const started = await beginLogin(session);
		if (!started.ok) {
			state.loginSessions.set(session.sessionKey, session);
			return { ok: false, message: started.message, sessionKey: session.sessionKey };
		}
		state.loginSessions.set(session.sessionKey, session);
		// 后台 watcher 不阻塞请求。
		void watchLogin(session);
		let qrcodeDataUrl = "";
		try {
			qrcodeDataUrl = await QRCode.toDataURL(session.qrcodeUrl);
		} catch {
			qrcodeDataUrl = "";
		}
		return {
			ok: true,
			sessionKey: session.sessionKey,
			qrcodeUrl: session.qrcodeUrl,
			qrcodeDataUrl,
		};
	}

	function handleLoginPoll(payload) {
		const sessionKey = String(payload?.sessionKey ?? "");
		const session = state.loginSessions.get(sessionKey);
		if (!session) return { ok: false, error: "login-not-found", message: "登录会话不存在或已过期" };
		return { ok: true, ...loginSnapshot(session) };
	}

	function handleLoginVerify(payload) {
		const sessionKey = String(payload?.sessionKey ?? "");
		const session = state.loginSessions.get(sessionKey);
		if (!session) return { ok: false, error: "login-not-found", message: "登录会话不存在或已过期" };
		const result = submitVerifyCode(session, payload?.code);
		return result.ok ? { ok: true } : { ok: false, message: result.message };
	}

	function handleLoginCancel(payload) {
		const sessionKey = String(payload?.sessionKey ?? "");
		const session = state.loginSessions.get(sessionKey);
		if (session) cancelLogin(session);
		state.loginSessions.delete(sessionKey);
		return { ok: true };
	}

	async function handleGatewayStart(payload) {
		if (state.gatewayState === "running" || state.gatewayState === "starting") {
			return { ok: true, state: state.gatewayState };
		}
		const config = featureConfigOf(api);
		const allowFrom = normalizeAllowFrom(config.allowFrom);
		// 允许空白名单启动：此时网关进入“仅记录模式”，所有消息都会被拦截，
		// 但发送者 ID 会出现在「最近发送者 ID」里，方便用户先捕获 ID 再加入白名单。
		const accountId = String(payload?.accountId ?? "") || String(config.accountId ?? "") || latestAccountId();
		if (!accountId) {
			return { ok: false, error: "no-account", message: "没有已登录的微信账号，请先扫码登录" };
		}
		const account = resolveAccountLocal(accountId);
		if (!account.token) {
			return { ok: false, error: "no-token", message: "该账号未登录或凭据缺失，请重新扫码" };
		}
		const lock = acquireRunLock(accountId);
		if (!lock.ok) {
			return { ok: false, error: "lock-conflict", message: `已有微信网关实例在运行（PID ${lock.pid}）` };
		}
		state.gatewayState = "starting";
		state.gatewayAccountId = accountId;
		state.lastError = "";
		const abort = new AbortController();
		state.abortController = abort;
		try {
			const mod = await import("../wechat/gateway.js");
			state.gatewayPromise = mod.runWeixinGateway(ctx, account, {
				abortSignal: abort.signal,
				sessionMode: config.sessionMode === "per-user" ? "per-user" : "room",
				allowFrom,
				onSender: (userId, info) => recordSender(userId, info),
			}).then(() => {
				state.gatewayState = "stopped";
				state.gatewayAccountId = null;
				releaseRunLock(accountId);
			}).catch((err) => {
				state.gatewayState = "error";
				state.lastError = err instanceof Error ? err.message : String(err);
				state.gatewayAccountId = null;
				releaseRunLock(accountId);
			});
			state.gatewayState = "running";
			return { ok: true, state: state.gatewayState, accountId };
		} catch (err) {
			state.gatewayState = "error";
			state.lastError = err instanceof Error ? err.message : String(err);
			releaseRunLock(accountId);
			return { ok: false, error: "start-failed", message: state.lastError };
		}
	}

	function handleGatewayStop() {
		if (state.abortController) {
			state.abortController.abort();
			state.gatewayState = "stopping";
		}
		return { ok: true, state: state.gatewayState };
	}

	async function handleAccountLogout(payload) {
		const accountId = String(payload?.accountId ?? "");
		if (!accountId) {
			return { ok: false, error: "missing-account", message: "缺少 accountId" };
		}
		// 如果注销的账号正是正在运行的网关账号，先停止网关。
		if (state.gatewayAccountId === accountId && state.abortController) {
			state.abortController.abort();
			state.gatewayState = "stopping";
			if (state.gatewayPromise) {
				await state.gatewayPromise.catch(() => {});
			}
		}
		clearWeixinAccount(accountId);
		unregisterWeixinAccountId(accountId);
		state.recentSenders = state.recentSenders.filter((item) => item.userId !== accountId);
		return { ok: true };
	}

	function handleStatus() {
		const allowFrom = normalizeAllowFrom(featureConfigOf(api).allowFrom);
		const accounts = listIndexedWeixinAccountIds().map((accountId) => {
			const data = loadWeixinAccount(accountId);
			return {
				accountId,
				loggedIn: Boolean(data?.token),
				loginAt: typeof data?.savedAt === "string" ? data.savedAt : "",
			};
		});
		const config = featureConfigOf(api);
		const aiCapabilities = {};
		for (const id of ["asr", "vision", "image"]) {
			const cfg = getCapabilityConfig(id);
			aiCapabilities[id] = cfg ? { configured: true, model: cfg.model, baseUrl: cfg.baseUrl } : { configured: false };
		}
		return {
			loggedIn: accounts.length > 0,
			accounts,
			currentAccountId: String(config.accountId ?? "") || (accounts.length > 0 ? accounts[accounts.length - 1].accountId : ""),
			gatewayState: state.gatewayState,
			gatewayAccountId: state.gatewayAccountId,
			allowFrom,
			sessionMode: config.sessionMode === "per-user" ? "per-user" : "room",
			lastError: state.lastError,
			recentSenders: state.recentSenders,
			captureOnly: state.gatewayState === "running" && allowFrom.length === 0,
			aiCapabilities,
		};
	}

	const dispose = ctx.webServer.register({
		kind: "prefix",
		path: "/dsh-tools/wechat.openclaw/api",
		handler: async (req, res) => {
			if (!api.fence(req)) {
				api.writeError(res, "forbidden", "forbidden", 403);
				return;
			}
			if (req.method !== "POST") {
				api.writeError(res, "method-error", "method not allowed", 405);
				return;
			}
			const pathname = new URL(req.url ?? "/", "http://dsh.internal").pathname;
			const prefix = "/dsh-tools/wechat.openclaw/api/";
			const method = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : undefined;
			if (method === undefined) {
				api.writeError(res, "not-found", "unknown api method", 404);
				return;
			}
			try {
				const payload = await api.readJsonBody(req);
				if (method === "status") {
					api.writeOk(res, handleStatus());
					return;
				}
				if (method === "login/start") {
					api.writeOk(res, await handleLoginStart(payload));
					return;
				}
				if (method === "login/poll") {
					api.writeOk(res, handleLoginPoll(payload));
					return;
				}
				if (method === "login/verify") {
					api.writeOk(res, handleLoginVerify(payload));
					return;
				}
				if (method === "login/cancel") {
					api.writeOk(res, handleLoginCancel(payload));
					return;
				}
				if (method === "gateway/start") {
					api.writeOk(res, await handleGatewayStart(payload));
					return;
				}
				if (method === "gateway/stop") {
					api.writeOk(res, handleGatewayStop());
					return;
				}
				if (method === "account/logout") {
					api.writeOk(res, await handleAccountLogout(payload));
					return;
				}
				if (method === "media/list") {
					api.writeOk(res, handleMediaList());
					return;
				}
				if (method === "media/clean") {
					api.writeOk(res, handleMediaClean());
					return;
				}
				if (method === "media/open") {
					api.writeOk(res, await handleMediaOpen(payload));
					return;
				}
				if (method === "ai/config") {
					api.writeOk(res, handleAiConfig(payload));
					return;
				}
				api.writeError(res, "not-found", "unknown api method", 404);
			} catch (error) {
				api.writeError(res, "internal", error instanceof Error ? error.message : String(error), 500);
			}
		},
	}, "dsh-tools/wechat.openclaw: routes");

	// 文生图工具：仅当 image 能力已配置时注册，供 Agent 主动画图并发给微信。
	if (getCapabilityConfig("image")) {
		const tools = ctx.get("tools");
		if (tools !== undefined && tools !== null && typeof tools.register === "function") {
			try {
				const disposeTool = tools.register({
					name: "generate_image",
					description: "根据文字描述生成一张图片，返回图片的本地路径。生成的图片可以直接用 [image:路径] 标记发送给用户。",
					parameters: {
						type: "object",
						properties: {
							prompt: { type: "string", description: "图片内容描述（中文）" },
						},
						required: ["prompt"],
					},
					async execute(args) {
						const { generateImage } = await import("dsh-weixin-gateway/lib/weixin/ai-service.js");
						return generateImage(args.prompt);
					},
				});
				if (typeof disposeTool === "function") disposers.push(disposeTool);
			} catch (error) {
				api.log("generate_image tool registration failed:", error);
			}
		}
	}

	api.log("wechat.openclaw feature active");

	// autoStart：开启 feature 且配置允许时自动拉起网关（不阻塞注册）。
	const bootConfig = featureConfigOf(api);
	if (bootConfig.autoStart === true) {
		void handleGatewayStart({});
	}

	return () => {
		if (state.abortController) state.abortController.abort();
		for (const session of state.loginSessions.values()) cancelLogin(session);
		state.loginSessions.clear();
		for (const disposeTool of disposers) {
			try {
				disposeTool();
			} catch {}
		}
		dispose();
	};
}
