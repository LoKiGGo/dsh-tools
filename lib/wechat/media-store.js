/**
 * dsh-tools 自研微信媒体存储。
 *
 * 按文件内容魔数（magic bytes）分类保存到：
 *   media/inbound/images
 *   media/inbound/videos
 *   media/inbound/files
 *   media/inbound/voice
 * 不再使用上游 dsh-weixin-gateway 的 saveMediaBuffer，避免 inbound/inbound 嵌套。
 */

import fs from "node:fs";
import path from "node:path";
import { resolveStateDir } from "./vendor/weixin/storage/state-dir.js";

const MEDIA_ROOT = path.join(resolveStateDir(), "weixin-dsh", "media");

const MAGIC_RULES = [
	{ bytes: [0x89, 0x50, 0x4e, 0x47], ext: ".png", subdir: "images" },
	{ bytes: [0xff, 0xd8, 0xff], ext: ".jpg", subdir: "images" },
	{ bytes: [0x47, 0x49, 0x46, 0x38], ext: ".gif", subdir: "images" },
	{ bytes: [0x52, 0x49, 0x46, 0x46], ext: ".webp", subdir: "images" },
	{ bytes: [0x42, 0x4d], ext: ".bmp", subdir: "images" },
	{ bytes: [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70], ext: ".mp4", subdir: "videos" },
	{ bytes: [0x49, 0x44, 0x33], ext: ".mp3", subdir: "voice" },
	{ bytes: [0x52, 0x49, 0x46, 0x46], ext: ".wav", subdir: "voice" },
	{ bytes: [0x02, 0x23, 0x21, 0x53, 0x49, 0x4c, 0x4b], ext: ".silk", subdir: "voice" },
	{ bytes: [0x23, 0x21, 0x53, 0x49, 0x4c, 0x4b], ext: ".silk", subdir: "voice" },
];

function infer(buf) {
	for (const rule of MAGIC_RULES) {
		if (buf.length >= rule.bytes.length && rule.bytes.every((b, i) => buf[i] === b)) {
			// RIFF 需要区分 WEBP / WAVE
			if (rule.ext === ".webp" && buf.length >= 12 && buf.toString("ascii", 8, 12) !== "WEBP") continue;
			if (rule.ext === ".wav" && buf.length >= 12 && buf.toString("ascii", 8, 12) !== "WAVE") continue;
			return { subdir: rule.subdir, ext: rule.ext };
		}
	}
	return { subdir: "files", ext: ".bin" };
}

/** 原始文件名安全过滤：拒绝路径穿越、绝对路径、NUL 等。 */
export function safeOriginalName(name) {
	if (typeof name !== "string" || name.length === 0 || name.length > 255) return null;
	if (name.includes("\0") || name.includes("/") || name.includes("\\") || name === "." || name === "..") return null;
	return name;
}

/**
 * 保存微信媒体。
 *
 * 兼容上游调用签名：saveMedia(buffer, contentType, subdir, maxBytes, originalName)，
 * 但忽略传入的 subdir，改为按文件魔数自动分类。
 */
export async function saveWechatMedia(buffer, _contentType, _subdir, _maxBytes, originalName) {
	const info = infer(buffer);
	const dir = path.join(MEDIA_ROOT, "inbound", info.subdir);
	fs.mkdirSync(dir, { recursive: true });
	const safeName = safeOriginalName(originalName);
	const fileName = safeName || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${info.ext}`;
	const filePath = path.join(dir, fileName);
	fs.writeFileSync(filePath, buffer);
	return { path: filePath };
}

export function getMediaRoot() {
	return MEDIA_ROOT;
}
