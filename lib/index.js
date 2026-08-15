/**
 * dsh-tools — Host half.
 *
 * 个人工具箱插件的数据平面，服务一条受回环保护的 JSON API：
 *   - POST /dsh-tools/api/config      读取配置快照（含全部功能元数据）
 *   - POST /dsh-tools/api/config/set  修改某功能开关：写盘（自动 .bak）
 *                                     后差异热应用（dispose/register 该功能）
 *   - POST /dsh-tools/api/ping        健康检查（客户端重启后探测用）
 *   - POST /dsh-tools/api/restart     一键重启 dsh web（restart.web 功能贡献）
 *   - GET  /dsh-tools/api/events      SSE 推送流（notify.task-done 开启时）
 *
 * 配置持久化在私有 JSON：<DSH_HOME>/profiles/web/plugins-data/dsh-tools.json。
 * 信任围栏、JSON 封装沿用 web 插件既有模式（与 dsh-plugin-toggle 一致）。
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { FEATURES } from "./features/index.js";

/** Plugin identity for cordis.yml rows. */
export const name = 'dsh-tools'

/** Hard dependencies: webServer serves the API + SSE, loader supplies trusted hosts. */
export const inject = ['webServer', 'loader']

const PROFILE_NAME = "web";
const MAX_BODY_BYTES = 1 << 20;

// --- profile / config paths ---

function homeDir() {
	return process.env.DSH_HOME || join(homedir(), ".dsh");
}

function profileDir() {
	return join(homeDir(), "profiles", PROFILE_NAME);
}

function configPath() {
	return join(profileDir(), "plugins-data", "dsh-tools.json");
}

// --- config persistence ---

/** Read the stored config, merging feature defaults for missing keys. */
function readConfig() {
	let stored = null;
	try {
		if (existsSync(configPath())) stored = JSON.parse(readFileSync(configPath(), "utf8"));
	} catch (error) {
		console.error("dsh-tools: failed to read config, falling back to defaults:", error);
	}
	const features = {};
	for (const feature of FEATURES) {
		const value = stored && stored.features && typeof stored.features === "object"
			? stored.features[feature.key]
			: undefined;
		// alwaysOn features are forced on regardless of stored config.
		features[feature.key] = feature.alwaysOn === true
			? true
			: (typeof value === "boolean" ? value : (feature.defaultEnabled === true));
	}
	return { features };
}

function saveConfig(config) {
	const path = configPath();
	try {
		mkdirSync(dirname(path), { recursive: true });
	} catch {}
	try {
		copyFileSync(path, `${path}.bak`);
	} catch {}
	writeFileSync(path, JSON.stringify(config, null, 2) + "\n");
}

/** Client-facing snapshot: feature metadata + enabled flags (no live objects). */
function snapshot(config) {
	return {
		features: FEATURES.map((feature) => ({
			key: feature.key,
			label: feature.label,
			description: feature.description,
			kind: feature.kind,
			alwaysOn: feature.alwaysOn === true,
			// 非面板功能（如 plugin-catalog）不在工具箱设置页生成页签。
			panel: feature.panel !== false,
			enabled: config.features[feature.key] === true,
		})),
	};
}

// --- trust fence (mirrors the published web-plugin pattern) ---

function header(headers, key) {
	const value = headers[key];
	return typeof value === "string" ? value : undefined;
}

function parseAuthority(authority) {
	try {
		return new URL(`http://${authority}`);
	} catch {
		return undefined;
	}
}

function isLoopbackHostname(hostname) {
	if (hostname === "localhost" || hostname === "[::1]") return true;
	const parts = hostname.split(".");
	return parts.length === 4 && parts[0] === "127" && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

function isTrustedAuthority(hostUrl, trustedHosts) {
	return trustedHosts.some((entry) => {
		const entryUrl = parseAuthority(entry);
		if (entryUrl === undefined) return false;
		const port = entryUrl.port !== "" ? entryUrl.port : new URL(`https://${entry}`).port;
		const canonicalEntry = port === "" ? entryUrl.hostname : `${entryUrl.hostname}:${port}`;
		return canonicalEntry === entryUrl.hostname ? entryUrl.hostname === hostUrl.hostname : entryUrl.host === hostUrl.host;
	});
}

/** True when the request comes from this deployment's own page (loopback or configured trusted host). */
function isTrustedApiRequest(request, trustedHosts) {
	const host = header(request.headers, "host");
	if (host === undefined) return false;
	const hostUrl = parseAuthority(host);
	if (hostUrl === undefined) return false;
	if (!isLoopbackHostname(hostUrl.hostname) && !isTrustedAuthority(hostUrl, trustedHosts)) return false;
	if (header(request.headers, "sec-fetch-site") === "cross-site") return false;
	const origin = header(request.headers, "origin");
	if (origin === undefined) return true;
	try {
		return new URL(origin).host === hostUrl.host;
	} catch {
		return false;
	}
}

function trustedHostsOf(ctx) {
	for (const entry of ctx.loader.entries()) {
		if (entry.options.name === "connection") return entry.options.config?.trustedHosts ?? [];
	}
	return [];
}

// --- HTTP helpers ---

function writeJson(res, status, body) {
	const payload = JSON.stringify(body);
	res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
	res.end(payload);
}

function writeOk(res, value) {
	writeJson(res, 200, { ok: true, value });
}

function writeError(res, code, message, status = 500) {
	writeJson(res, status, { ok: false, error: { code, message } });
}

async function readJsonBody(req) {
	const chunks = [];
	let total = 0;
	for await (const chunk of req) {
		const buffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
		total += buffer.length;
		if (total > MAX_BODY_BYTES) throw new Error("request body too large");
		chunks.push(buffer);
	}
	const text = Buffer.concat(chunks).toString("utf8");
	if (text.trim() === "") return {};
	try {
		return JSON.parse(text);
	} catch {
		throw new Error("request body is not valid JSON");
	}
}

// --- SSE hub ---

function handleEvents(req, res, sseClients) {
	res.writeHead(200, {
		"content-type": "text/event-stream; charset=utf-8",
		"cache-control": "no-cache, no-transform",
		"connection": "keep-alive",
	});
	res.write(": connected\n\n");
	sseClients.add(res);
	const drop = () => sseClients.delete(res);
	req.on("close", drop);
	res.on("close", drop);
}

/**
 * Plugin body: fence the routes, serve config/toggle/ping, delegate feature
 * methods, and stream SSE events.
 */
export function apply(ctx) {
	const trustedHosts = trustedHostsOf(ctx);
	const fence = (req) => isTrustedApiRequest(req, trustedHosts);

	let config = readConfig();
	const sseClients = new Set();
	const active = new Map(); // featureKey -> disposer

	const api = {
		config: () => config,
		featureEnabled: (key) => config.features[key] === true,
		broadcast: (type, data) => {
			const payload = JSON.stringify({ type, data });
			for (const res of sseClients) {
				try {
					res.write(`data: ${payload}\n\n`);
				} catch {}
			}
		},
		fence,
		writeOk,
		writeError,
		readJsonBody,
		log: (...args) => console.log("dsh-tools:", ...args),
	};

	/** Enable or disable one feature by key: dispose/register it on change. */
	const reconcile = (feature) => {
		const enabled = config.features[feature.key] === true;
		const current = active.get(feature.key);
		if (enabled && current !== undefined) return;
		if (!enabled && current === undefined) return;
		if (!enabled) {
			try {
				current();
			} catch (error) {
				console.error(`dsh-tools: dispose ${feature.key} failed:`, error);
			}
			active.delete(feature.key);
			return;
		}
		try {
			const disposer = feature.register(ctx, api);
			active.set(feature.key, typeof disposer === "function" ? disposer : () => {});
		} catch (error) {
			console.error(`dsh-tools: register ${feature.key} failed:`, error);
		}
	};

	for (const feature of FEATURES) reconcile(feature);

	// Feature-contributed POST methods, e.g. restart.web -> "restart".
	const featureMethods = new Map(); // method -> featureKey
	for (const feature of FEATURES) {
		if (feature.methods === undefined || typeof feature.methods !== "object") continue;
		for (const method of Object.keys(feature.methods)) featureMethods.set(method, feature.key);
	}
	const knownMethods = new Set(["config", "config/set", "ping", ...featureMethods.keys()]);

	// SSE heartbeat + connection cleanup on unload.
	ctx.effect(() => {
		const heartbeat = setInterval(() => {
			for (const res of sseClients) {
				try {
					res.write(": ping\n\n");
				} catch {}
			}
		}, 25000);
		return () => {
			clearInterval(heartbeat);
			for (const res of sseClients) {
				try {
					res.end();
				} catch {}
			}
			sseClients.clear();
		};
	});

	ctx.effect(() => ctx.webServer.register({
		kind: "prefix",
		path: "/dsh-tools/api",
		handler: async (req, res) => {
			if (!fence(req)) {
				writeError(res, "forbidden", "forbidden", 403);
				return;
			}
			const pathname = new URL(req.url ?? "/", "http://dsh.internal").pathname;
			const prefix = "/dsh-tools/api/";
			const suffix = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : undefined;

			// SSE stream (the only GET this API accepts).
			if (suffix === "events" && req.method === "GET") {
				if (config.features["notify.task-done"] !== true) {
					writeError(res, "feature-disabled", "notify.task-done is disabled", 404);
					return;
				}
				handleEvents(req, res, sseClients);
				return;
			}

			if (req.method !== "POST") {
				writeError(res, "method-error", "method not allowed", 405);
				return;
			}
			if (suffix === undefined || !knownMethods.has(suffix)) {
				writeError(res, "not-found", "unknown api method", 404);
				return;
			}
			try {
				const payload = await readJsonBody(req);
				if (suffix === "ping") {
					writeOk(res, { ok: true, pong: Date.now() });
					return;
				}
				if (suffix === "config") {
					writeOk(res, snapshot(config));
					return;
				}
				if (suffix === "config/set") {
					const key = String(payload && payload.key ? payload.key : "");
					const feature = FEATURES.find((entry) => entry.key === key);
					if (feature === undefined) throw new Error(`未知功能 ${JSON.stringify(key)}`);
					// alwaysOn features cannot be disabled — ignore the request.
					const enabled = feature.alwaysOn === true ? true : payload.enabled === true;
					config.features[key] = enabled;
					saveConfig(config);
					reconcile(feature);
					writeOk(res, snapshot(config));
					return;
				}
				const featureKey = featureMethods.get(suffix);
				if (featureKey !== undefined) {
					if (config.features[featureKey] !== true) {
						writeError(res, "feature-disabled", `${featureKey} is disabled`, 404);
						return;
					}
					const feature = FEATURES.find((entry) => entry.key === featureKey);
					await feature.methods[suffix](req, res, api, payload);
					return;
				}
				writeError(res, "not-found", "unknown api method", 404);
			} catch (error) {
				writeError(res, "internal", error instanceof Error ? error.message : String(error), 500);
			}
		},
	}), "dsh-tools: /dsh-tools/api routes");

	console.log("dsh-tools host mounted; features:", FEATURES.map((f) => `${f.key}=${config.features[f.key]}`).join(", "));
}
