/**
 * ui.usage — 按自然日聚合会话日志中的真实 LLM usage。
 *
 * 数据源：`<DSH_HOME>/sessions/.../session.jsonl.zstd`（多帧 zstd）。
 * 每个 `assistant/message` 事件携带 `usage` 与 `time`，据此按请求实际发生
 * 日期统计 token，而不是把整个会话累计值记到 updatedAt。
 *
 * 性能缓解：
 * - 首次全量扫描后写磁盘缓存；
 * - 后续只重扫 size/mtime 变化的日志文件（增量）；
 * - 并发限制，避免同时解压大量文件；
 * - 前端只读聚合结果，不做重活。
 */

import { readFile, readdir, stat, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import * as zlib from "node:zlib";

const ZSTD_MAGIC = 4247762216;
const SCAN_CONCURRENCY = 4;
const CACHE_FILE_NAME = "dsh-tools-usage-daily.json";
const CACHE_VERSION = 1;

const zstdDecompressSync = zlib.zstdDecompressSync;
const zstdAvailable = typeof zstdDecompressSync === "function";

function dshHome() {
	return process.env.DSH_HOME || join(homedir(), ".dsh");
}

function sessionsRoot() {
	return join(dshHome(), "sessions");
}

function cacheFilePath() {
	return join(dshHome(), "profiles", "web", "plugins-data", CACHE_FILE_NAME);
}

/** 解析一个 zstd frame 的字节区间（与 dsh-file-changes 同款头部解析）。 */
function scanZstdFrame(buffer, start) {
	let offset = start;
	if (buffer.length - offset < 4 || buffer.readUInt32LE(offset) !== ZSTD_MAGIC) return null;
	offset += 4;
	if (offset === buffer.length) return null;
	const descriptor = buffer.readUInt8(offset++);
	if ((descriptor & 24) !== 0) return null;
	const contentSizeFlag = descriptor >>> 6;
	const singleSegment = (descriptor & 32) !== 0;
	const checksum = (descriptor & 4) !== 0;
	const dictionaryFlag = descriptor & 3;
	const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag;
	const contentSizeBytes = contentSizeFlag === 0 ? (singleSegment ? 1 : 0) : (1 << contentSizeFlag);
	const remainingHeaderBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes;
	if (buffer.length - offset < remainingHeaderBytes) return null;
	offset += remainingHeaderBytes;
	for (;;) {
		if (buffer.length - offset < 3) return null;
		const blockHeader = buffer.readUIntLE(offset, 3);
		offset += 3;
		const lastBlock = (blockHeader & 1) !== 0;
		const blockType = (blockHeader >>> 1) & 3;
		const blockSize = blockHeader >>> 3;
		if (blockType === 3) return null;
		const payloadBytes = blockType === 1 ? 1 : blockSize;
		if (buffer.length - offset < payloadBytes) return null;
		offset += payloadBytes;
		if (lastBlock) break;
	}
	if (checksum) offset += 4;
	return { start, end: offset };
}

/** 解压整个会话日志（可能由多个 zstd frame 拼接而成）。 */
function decompressSessionLog(buffer) {
	let text = "";
	let offset = 0;
	while (offset < buffer.length) {
		const frame = scanZstdFrame(buffer, offset);
		if (!frame) break;
		text += zstdDecompressSync(buffer.subarray(frame.start, frame.end)).toString("utf8");
		offset = frame.end;
	}
	return text;
}

function pad2(n) {
	return String(n).padStart(2, "0");
}

/** 本地时区自然日 key：YYYY-MM-DD（与 DeepSeek 官网中国时区口径一致）。 */
function dayKey(time) {
	const d = new Date(time);
	return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
}

function emptyModelBucket() {
	return { tokens: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
}

function emptyDayBucket() {
	return { tokens: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, sessions: 0, byModel: {} };
}

function num(value) {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function addUsageToBucket(bucket, usage, modelKey) {
	const input = num(usage.inputTokens);
	const output = num(usage.outputTokens);
	const cacheRead = num(usage.cacheReadTokens);
	const cacheWrite = num(usage.cacheWriteTokens);
	const tokens = input + output + cacheRead + cacheWrite;
	bucket.tokens += tokens;
	bucket.inputTokens += input;
	bucket.outputTokens += output;
	bucket.cacheReadTokens += cacheRead;
	bucket.cacheWriteTokens += cacheWrite;
	const model = bucket.byModel[modelKey] || emptyModelBucket();
	model.tokens += tokens;
	model.inputTokens += input;
	model.outputTokens += output;
	model.cacheReadTokens += cacheRead;
	model.cacheWriteTokens += cacheWrite;
	bucket.byModel[modelKey] = model;
}

/** 解析一个会话日志文本，返回 { dateKey -> dayBucket }，sessions 每个日期计 1。 */
function aggregateSessionText(text) {
	const days = {};
	for (const line of text.split("\n")) {
		if (line.trim() === "") continue;
		let event;
		try {
			event = JSON.parse(line);
		} catch {
			continue;
		}
		if (event === null || typeof event !== "object") continue;
		if (event.type !== "assistant/message" || event.data === null || typeof event.data !== "object") continue;
		const usage = event.data.usage;
		if (usage === null || typeof usage !== "object") continue;
		const source = event.data.message !== null && typeof event.data.message === "object" ? event.data.message.source : undefined;
		const modelKey = source !== null && typeof source === "object" && typeof source.provider === "string" && typeof source.model === "string"
			? source.provider + ":" + source.model
			: "unknown";
		const key = dayKey(event.time);
		if (days[key] === undefined) days[key] = emptyDayBucket();
		addUsageToBucket(days[key], usage, modelKey);
	}
	for (const key of Object.keys(days)) days[key].sessions = 1;
	return days;
}

/** 把某个日期的 bucket 合并进全局 days。 */
function mergeDayBucket(target, key, source) {
	const bucket = target[key] || emptyDayBucket();
	bucket.tokens += source.tokens;
	bucket.inputTokens += source.inputTokens;
	bucket.outputTokens += source.outputTokens;
	bucket.cacheReadTokens += source.cacheReadTokens;
	bucket.cacheWriteTokens += source.cacheWriteTokens;
	bucket.sessions += source.sessions;
	for (const modelKey of Object.keys(source.byModel)) {
		const srcModel = source.byModel[modelKey];
		const dstModel = bucket.byModel[modelKey] || emptyModelBucket();
		dstModel.tokens += srcModel.tokens;
		dstModel.inputTokens += srcModel.inputTokens;
		dstModel.outputTokens += srcModel.outputTokens;
		dstModel.cacheReadTokens += srcModel.cacheReadTokens;
		dstModel.cacheWriteTokens += srcModel.cacheWriteTokens;
		bucket.byModel[modelKey] = dstModel;
	}
	target[key] = bucket;
}

/** 把某文件的 days 合并进全局 days。 */
function mergeDaysInto(target, days) {
	for (const key of Object.keys(days)) {
		mergeDayBucket(target, key, days[key]);
	}
}

async function walkSessionFiles(dir) {
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return [];
	}
	const out = [];
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			out.push(...await walkSessionFiles(full));
		} else if (entry.isFile() && entry.name === "session.jsonl.zstd") {
			out.push(full);
		}
	}
	return out;
}

async function loadCache() {
	try {
		const text = await readFile(cacheFilePath(), "utf8");
		const parsed = JSON.parse(text);
		if (parsed !== null && typeof parsed === "object" && parsed.version === CACHE_VERSION && parsed.files !== null && typeof parsed.files === "object") {
			return parsed;
		}
	} catch {}
	return { version: CACHE_VERSION, files: {} };
}

async function saveCache(cache) {
	try {
		await mkdir(dirname(cacheFilePath()), { recursive: true });
		await writeFile(cacheFilePath(), JSON.stringify(cache), "utf8");
	} catch {}
}

async function mapWithConcurrency(items, limit, fn) {
	const results = new Array(items.length);
	let cursor = 0;
	async function worker() {
		while (cursor < items.length) {
			const index = cursor++;
			results[index] = await fn(items[index], index);
		}
	}
	const workers = [];
	for (let i = 0; i < Math.min(limit, items.length); i++) workers.push(worker());
	await Promise.all(workers);
	return results;
}

let inFlight = null;

/**
 * 构建按自然日聚合的 usage 数据。
 * @returns {{ supported: boolean, days: Object, scanned: number, updated: number, cached: number, failed: number }}
 */
export function buildDailyUsage() {
	if (inFlight !== null) return inFlight;
	inFlight = doBuildDailyUsage().finally(() => { inFlight = null; });
	return inFlight;
}

async function doBuildDailyUsage() {
	if (!zstdAvailable) {
		return { supported: false, days: {}, scanned: 0, updated: 0, cached: 0, failed: 0 };
	}
	const files = await walkSessionFiles(sessionsRoot());
	const cache = await loadCache();
	const current = new Set(files);
	for (const key of Object.keys(cache.files)) {
		if (!current.has(key)) delete cache.files[key];
	}

	const changed = [];
	const fresh = [];
	for (const file of files) {
		let st = null;
		try {
			st = await stat(file);
		} catch {}
		const entry = cache.files[file];
		if (st !== null && entry !== undefined && entry.size === st.size && entry.mtimeMs === st.mtimeMs) {
			fresh.push(file);
		} else {
			changed.push({ file, st });
		}
	}

	let failed = 0;
	if (changed.length > 0) {
		const outcomes = await mapWithConcurrency(changed, SCAN_CONCURRENCY, async ({ file, st }) => {
			if (st === null) return { ok: false, error: "stat-failed" };
			try {
				const buffer = await readFile(file);
				const text = decompressSessionLog(buffer);
				const days = aggregateSessionText(text);
				cache.files[file] = { size: st.size, mtimeMs: st.mtimeMs, days };
				return { ok: true };
			} catch (error) {
				return { ok: false, error: error instanceof Error ? error.message : String(error) };
			}
		});
		for (const outcome of outcomes) {
			if (!outcome.ok) failed += 1;
		}
		await saveCache(cache);
	}

	const days = {};
	for (const file of files) {
		const entry = cache.files[file];
		if (entry !== undefined && entry.days !== undefined && entry.days !== null) {
			mergeDaysInto(days, entry.days);
		}
	}
	return { supported: true, days, scanned: files.length, updated: changed.length, cached: fresh.length, failed };
}
