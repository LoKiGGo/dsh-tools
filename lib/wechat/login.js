/**
 * WeChat QR login state machine (web-profile friendly).
 *
 * 复用 dsh-weixin-gateway 的 iLink API 客户端，但把原本面向终端的
 * `waitForWeixinLogin`（stdin 读配对码）改成 API 驱动的状态机：
 * 登录会话保存在内存，`login/verify` 通过 `pendingVerifyCode` 喂码。
 */

import { randomUUID } from "node:crypto";
import { apiPostFetch, apiGetFetch } from "./vendor/weixin/api/api.js";
import {
	listIndexedWeixinAccountIds,
	loadWeixinAccount,
	saveWeixinAccount,
	registerWeixinAccountId,
} from "./vendor/weixin/accounts.js";

const FIXED_BASE_URL = "https://ilinkai.weixin.qq.com";
const DEFAULT_ILINK_BOT_TYPE = "3";
const LOGIN_TTL_MS = 5 * 60_000;
const LOGIN_TIMEOUT_MS = 480_000;
const MAX_QR_REFRESH = 3;
const QR_LONG_POLL_TIMEOUT_MS = 35_000;

/** Create an in-memory login session object. */
export function createLoginSession(accountIdHint) {
	return {
		sessionKey: accountIdHint || randomUUID(),
		qrcode: "",
		qrcodeUrl: "",
		startedAt: Date.now(),
		status: "idle",
		message: "",
		accountId: "",
		pendingVerifyCode: undefined,
		awaitingVerifyCode: false,
		scanned: false,
		aborted: false,
		currentBaseUrl: FIXED_BASE_URL,
		qrRefreshCount: 0,
	};
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function getLocalBotTokenList() {
	const ids = listIndexedWeixinAccountIds();
	const tokens = [];
	// 从最新账号开始取，最多 10 个。
	for (let i = ids.length - 1; i >= 0 && tokens.length < 10; i--) {
		const data = loadWeixinAccount(ids[i]);
		const token = data?.token?.trim();
		if (token) tokens.push(token);
	}
	return tokens;
}

async function fetchQRCode() {
	const raw = await apiPostFetch({
		baseUrl: FIXED_BASE_URL,
		endpoint: `ilink/bot/get_bot_qrcode?bot_type=${encodeURIComponent(DEFAULT_ILINK_BOT_TYPE)}`,
		body: JSON.stringify({ local_token_list: getLocalBotTokenList() }),
		label: "fetchQRCode",
	});
	return JSON.parse(raw);
}

async function pollQRStatus(session) {
	let endpoint = `ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(session.qrcode)}`;
	if (session.pendingVerifyCode) {
		endpoint += `&verify_code=${encodeURIComponent(session.pendingVerifyCode)}`;
	}
	try {
		const raw = await apiGetFetch({
			baseUrl: session.currentBaseUrl || FIXED_BASE_URL,
			endpoint,
			timeoutMs: QR_LONG_POLL_TIMEOUT_MS,
			label: "pollQRStatus",
		});
		return JSON.parse(raw);
	} catch (err) {
		// 长轮询超时/网络抖动都视为继续等待。
		if (err instanceof Error && err.name === "AbortError") return { status: "wait" };
		return { status: "wait" };
	}
}

async function refreshQRCode(session) {
	try {
		const qrResponse = await fetchQRCode();
		session.qrcode = qrResponse.qrcode;
		session.qrcodeUrl = qrResponse.qrcode_img_content;
		session.startedAt = Date.now();
		session.pendingVerifyCode = undefined;
		session.awaitingVerifyCode = false;
		session.scanned = false;
		return true;
	} catch {
		return false;
	}
}

/** Fetch a fresh QR and populate the session. */
export async function beginLogin(session) {
	session.status = "wait";
	session.message = "";
	try {
		const qrResponse = await fetchQRCode();
		session.qrcode = qrResponse.qrcode;
		session.qrcodeUrl = qrResponse.qrcode_img_content;
		session.startedAt = Date.now();
		session.status = "wait";
		session.message = "请用手机微信扫描二维码";
		return { ok: true, qrcodeUrl: session.qrcodeUrl };
	} catch (err) {
		session.status = "failed";
		session.message = `获取二维码失败: ${err instanceof Error ? err.message : String(err)}`;
		return { ok: false, message: session.message };
	}
}

/** Run the login watcher until confirmed/failed/aborted/expired. */
export async function watchLogin(session) {
	const deadline = Date.now() + LOGIN_TIMEOUT_MS;
	session.qrRefreshCount = 0;
	while (Date.now() < deadline && !session.aborted) {
		if (session.status === "confirmed" || session.status === "already_connected") return;
		if (session.status === "failed") return;

		// 需要配对码时，等待 login/verify 写入 pendingVerifyCode。
		if (session.awaitingVerifyCode && !session.pendingVerifyCode) {
			await sleep(500);
			continue;
		}

		const resp = await pollQRStatus(session);
		if (session.aborted) return;
		session.status = resp.status || "wait";

		switch (resp.status) {
			case "wait":
				break;
			case "scaned":
				if (session.pendingVerifyCode) session.pendingVerifyCode = undefined;
				session.awaitingVerifyCode = false;
				session.scanned = true;
				break;
			case "need_verifycode":
				session.awaitingVerifyCode = true;
				session.message = "请在手机微信上查看配对码并输入";
				break;
			case "expired":
			case "verify_code_blocked": {
				session.qrRefreshCount += 1;
				if (session.qrRefreshCount > MAX_QR_REFRESH) {
					session.status = "failed";
					session.message = "二维码多次失效，请稍后再试";
					return;
				}
				const refreshed = await refreshQRCode(session);
				if (!refreshed) {
					session.status = "failed";
					session.message = "刷新二维码失败";
					return;
				}
				session.status = "wait";
				break;
			}
			case "binded_redirect":
				session.status = "already_connected";
				session.message = "已连接过此 OpenClaw，无需重复连接";
				return;
			case "scaned_but_redirect":
				if (resp.redirect_host) {
					session.currentBaseUrl = `https://${resp.redirect_host}`;
				}
				break;
			case "confirmed": {
				if (!resp.ilink_bot_id) {
					session.status = "failed";
					session.message = "登录失败：服务器未返回 ilink_bot_id";
					return;
				}
				saveWeixinAccount(resp.ilink_bot_id, {
					token: resp.bot_token,
					baseUrl: resp.baseurl || FIXED_BASE_URL,
				});
				registerWeixinAccountId(resp.ilink_bot_id);
				session.accountId = resp.ilink_bot_id;
				session.status = "confirmed";
				session.message = "登录成功";
				return;
			}
			default:
				break;
		}
		await sleep(1000);
	}
	if (session.status !== "confirmed" && session.status !== "already_connected") {
		session.status = "expired";
		session.message = "登录超时，请重试";
	}
}

/** Submit a pairing code shown on the phone. */
export function submitVerifyCode(session, code) {
	if (typeof code !== "string" || code.trim() === "") {
		return { ok: false, message: "配对码不能为空" };
	}
	session.pendingVerifyCode = code.trim();
	session.awaitingVerifyCode = false;
	return { ok: true };
}

/** Cancel an in-progress login. */
export function cancelLogin(session) {
	session.aborted = true;
	session.status = "cancelled";
	session.message = "已取消登录";
}

/** Public snapshot (never exposes token). */
export function loginSnapshot(session) {
	return {
		sessionKey: session.sessionKey,
		status: session.status,
		message: session.message,
		accountId: session.accountId,
		qrcodeUrl: session.qrcodeUrl,
		awaitingVerifyCode: session.awaitingVerifyCode,
		scanned: session.scanned,
	};
}


