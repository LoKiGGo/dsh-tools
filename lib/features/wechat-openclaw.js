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

import QRCode from "qrcode";
import {
	listIndexedWeixinAccountIds,
	loadWeixinAccount,
	clearWeixinAccount,
	unregisterWeixinAccountId,
} from "dsh-weixin-gateway/lib/weixin/accounts.js";
import { acquireRunLock, releaseRunLock } from "dsh-weixin-gateway/lib/weixin/run-lock.js";
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

	/** Record a sender seen by the gateway (for the settings-page hint). */
	function recordSender(userId, info) {
		const list = state.recentSenders.filter((item) => item.userId !== userId);
		list.unshift({ userId, allowed: info.allowed === true, at: info.at || Date.now() });
		state.recentSenders = list.slice(0, 20);
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
				api.writeError(res, "not-found", "unknown api method", 404);
			} catch (error) {
				api.writeError(res, "internal", error instanceof Error ? error.message : String(error), 500);
			}
		},
	}, "dsh-tools/wechat.openclaw: routes");

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
		dispose();
	};
}
