/**
 * WeChat gateway loop (web-profile friendly, allowlist-aware).
 *
 * 从 dsh-weixin-gateway 的 driver.js 裁剪：保留长轮询收消息、AgentBridge
 * 回复、流式发送/媒体降级，新增 sender allowlist 门禁，并去掉 CLI/appExit
 * 依赖。停止通过 AbortController 控制。
 */

import { getUpdates, notifyStart, sendTyping } from "dsh-weixin-gateway/lib/weixin/api/api.js";
import { MessageItemType } from "dsh-weixin-gateway/lib/weixin/api/types.js";
import { WeixinConfigManager } from "dsh-weixin-gateway/lib/weixin/api/config-cache.js";
import { sendMessageWeixin } from "dsh-weixin-gateway/lib/weixin/send.js";
import { sendWeixinMediaFile } from "dsh-weixin-gateway/lib/weixin/send-media.js";
import { WeixinStreamingSender } from "dsh-weixin-gateway/lib/weixin/streaming-sender.js";
import { weixinMessageToMsgContext } from "dsh-weixin-gateway/lib/weixin/inbound.js";
import { downloadMediaFromItem } from "dsh-weixin-gateway/lib/weixin/media/media-download.js";
import { saveMediaBuffer } from "dsh-weixin-gateway/lib/weixin/media-store.js";
import { askAgentStreaming } from "dsh-weixin-gateway/lib/bridge.js";
import { SessionRouter } from "dsh-weixin-gateway/lib/weixin/session-router.js";
import { logger } from "dsh-weixin-gateway/lib/weixin/util/logger.js";
import { isAllowed } from "./allowlist.js";

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run the WeChat gateway until abortSignal is set.
 *
 * @param ctx DSH Cordis context
 * @param account resolved WeChat account ({ accountId, baseUrl, token, cdnBaseUrl })
 * @param opts { abortSignal, sessionMode, allowFrom }
 */
export async function runWeixinGateway(ctx, account, opts = {}) {
	const { abortSignal, allowFrom = [], onSender } = opts;
	const sessionMode = opts.sessionMode ?? "room";
	const accountId = account.accountId;
	const baseUrl = account.baseUrl;
	const token = account.token;
	if (!token) {
		throw new Error(`账号 ${accountId} 未登录，请先运行微信登录`);
	}

	try {
		const resp = await notifyStart({ baseUrl, token });
		if (resp.ret !== undefined && resp.ret !== 0) {
			logger.warn(`weixin-gateway: notifyStart ret=${resp.ret} errmsg=${resp.errmsg ?? ""}`);
		}
	} catch (err) {
		logger.warn(`weixin-gateway: notifyStart failed (ignored): ${String(err)}`);
	}

	const router = new SessionRouter(ctx, sessionMode);
	const configManager = new WeixinConfigManager({ baseUrl, token }, (msg) => logger.debug(msg));
	let getUpdatesBuf = "";
	let sessionTimeoutCount = 0;
	logger.info(`weixin-gateway: polling started for ${accountId}`);

	while (abortSignal?.aborted !== true) {
		try {
			const resp = await getUpdates({
				baseUrl,
				token,
				get_updates_buf: getUpdatesBuf,
				timeoutMs: 30_000,
				abortSignal,
			});
			getUpdatesBuf = resp.get_updates_buf ?? getUpdatesBuf;

			if (resp.errcode === -14) {
				sessionTimeoutCount += 1;
				if (sessionTimeoutCount >= 3) {
					logger.error("weixin-gateway: session invalid (-14) x3, backing off 5min");
					await sleep(300_000);
					sessionTimeoutCount = 0;
				} else {
					logger.warn(`weixin-gateway: session timeout (-14) x${sessionTimeoutCount}, retrying`);
					await sleep(5_000);
				}
				continue;
			}
			sessionTimeoutCount = 0;

			for (const msg of resp.msgs ?? []) {
				const userId = msg.from_user_id ?? "";
				if (!userId) continue;
				const allowed = isAllowed(allowFrom, userId);
				if (typeof onSender === "function") {
					onSender(userId, { allowed, at: Date.now() });
				}
				if (!allowed) {
					logger.warn(`weixin-gateway: blocked non-allowlisted sender ${userId}`);
					continue;
				}
				const handle = await router.getSession(userId);
				await handleIncoming(ctx, handle, account, msg, baseUrl, token, configManager);
			}
		} catch (err) {
			if (abortSignal?.aborted) break;
			logger.error(`weixin-gateway: poll error: ${String(err)}`);
			await sleep(2_000);
		}
	}

	await router.disposeAll();
	logger.info(`weixin-gateway: stopped for ${accountId} (${router.size} sessions)`);
}

/** Handle one inbound WeChat message: media-aware prompt → agent → reply. */
async function handleIncoming(ctx, agentHandle, account, msg, baseUrl, token, configManager) {
	const to = msg.from_user_id ?? "";
	const contextToken = msg.context_token;
	const mainMediaItem = pickMediaItem(msg);
	const mediaOpts = {};

	if (mainMediaItem) {
		try {
			const downloaded = await downloadMediaFromItem(mainMediaItem, {
				cdnBaseUrl: account.cdnBaseUrl,
				saveMedia: saveMediaBuffer,
				log: (m) => logger.debug(m),
				errLog: (m) => logger.warn(m),
				label: "inbound",
			});
			Object.assign(mediaOpts, downloaded);
		} catch (err) {
			logger.warn(`weixin-gateway: media download failed: ${String(err)}`);
		}
	}

	const msgCtx = weixinMessageToMsgContext(msg, account.accountId, mediaOpts);
	const text = msgCtx.Body.trim();

	let prompt;
	if (mediaOpts.decryptedVoicePath) {
		const transcript = await transcribeVoice(mediaOpts.decryptedVoicePath);
		if (transcript) {
			prompt = `[收到一条语音消息，语音转文字结果: "${transcript}"] ${text}`;
		} else {
			prompt = `[收到一条语音消息，已保存到: ${mediaOpts.decryptedVoicePath}（转写失败）] ${text}`;
		}
	} else if (mediaOpts.decryptedPicPath) {
		const description = await describeInboundImage(mediaOpts.decryptedPicPath);
		if (description) {
			prompt = `[收到一张图片，AI 视觉描述: "${description}"。图片已保存到: ${mediaOpts.decryptedPicPath}，需要时可以读取] ${text}`;
		} else {
			prompt = `[收到一张图片，已保存到: ${mediaOpts.decryptedPicPath}] ${text}`;
		}
	} else if (mediaOpts.decryptedVideoPath) {
		prompt = `[收到一个视频，已保存到: ${mediaOpts.decryptedVideoPath}] ${text}`;
	} else if (mediaOpts.decryptedFilePath) {
		prompt = `[收到一个文件，已保存到: ${mediaOpts.decryptedFilePath}（${mediaOpts.fileMediaType ?? "unknown"}）] ${text}`;
	} else {
		prompt = text;
	}

	if (!prompt) {
		logger.debug(`weixin-gateway: ignoring empty message from ${to}`);
		return;
	}

	logger.info(`weixin-gateway: [${account.accountId}] ${to}: ${prompt.slice(0, 120)}`);
	try {
		const sender = new WeixinStreamingSender(async (textChunk) => {
			await sendMessageWeixin({
				to,
				text: textChunk,
				opts: { baseUrl, token, contextToken },
			});
		});

		const cached = await configManager.getForUser(to, contextToken);
		if (cached.typingTicket) {
			await sendTyping({
				baseUrl,
				token,
				body: { ilink_user_id: to, typing_ticket: cached.typingTicket, status: 1 },
			}).catch(() => undefined);
		}

		const result = await askAgentStreaming(agentHandle, prompt, {
			onDelta: (delta) => {
				void sender.feed(delta);
			},
		});

		if (result.error !== undefined) {
			await sendMessageWeixin({
				to,
				text: `抱歉，处理失败：${result.error}`,
				opts: { baseUrl, token, contextToken },
			}).catch((err) => logger.error(`weixin-gateway: send error reply: ${String(err)}`));
			return;
		}

		const { mediaParts, ttsText, textParts } = await sender.flush();
		for (const part of mediaParts) {
			try {
				await sendWeixinMediaFile({
					filePath: part.path,
					to,
					text: part.caption ?? "",
					opts: { baseUrl, token, contextToken },
					cdnBaseUrl: account.cdnBaseUrl,
				});
			} catch (err) {
				logger.error(`weixin-gateway: send media failed: ${String(err)}`);
				await sendMessageWeixin({
					to,
					text: `媒体发送失败（${part.path}）：${err instanceof Error ? err.message : String(err)}`,
					opts: { baseUrl, token, contextToken },
				}).catch(() => undefined);
			}
		}
		const textReply = [ttsText, ...textParts].filter(Boolean).join("\n").trim();
		if (textReply) {
			await sendMessageWeixin({
				to,
				text: textReply,
				opts: { baseUrl, token, contextToken },
			});
			logger.info(`weixin-gateway: replied to ${to} (${textReply.length} chars)`);
		}
	} catch (err) {
		logger.error(`weixin-gateway: handle message error: ${String(err)}`);
		await sendMessageWeixin({
			to,
			text: `服务开小差了：${err instanceof Error ? err.message : String(err)}`,
			opts: { baseUrl, token, contextToken },
		}).catch(() => undefined);
	}
}

function pickMediaItem(full) {
	const hasDownloadableMedia = (m) => Boolean(m?.encrypt_query_param || m?.full_url);
	return (
		full.item_list?.find((i) => i.type === MessageItemType.IMAGE && hasDownloadableMedia(i.image_item?.media)) ??
		full.item_list?.find((i) => i.type === MessageItemType.VIDEO && hasDownloadableMedia(i.video_item?.media)) ??
		full.item_list?.find((i) => i.type === MessageItemType.FILE && hasDownloadableMedia(i.file_item?.media)) ??
		full.item_list?.find((i) => i.type === MessageItemType.VOICE && i.voice_item?.media)
	);
}

async function transcribeVoice(filePath) {
	try {
		const { transcribeAudio } = await import("dsh-weixin-gateway/lib/weixin/ai-service.js");
		const text = await transcribeAudio(filePath);
		return text;
	} catch {
		return null;
	}
}

async function describeInboundImage(filePath) {
	try {
		const { describeImage } = await import("dsh-weixin-gateway/lib/weixin/ai-service.js");
		const desc = await describeImage(filePath);
		return desc;
	} catch {
		return null;
	}
}
