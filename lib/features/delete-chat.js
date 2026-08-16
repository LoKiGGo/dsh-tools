/**
 * Feature: delete-chat — 会话管理（合并自 dsh-delete-chat）。
 *
 * 数据面路由前缀：/dsh-tools/delete-chat/api/{list,delete}（与原插件
 * /delete-chat/api 分开，避免迁移期间前缀冲突）。信任围栏、JSON 封装
 * 复用宿主框架（api.fence / api.writeOk / api.writeError / api.readJsonBody）。
 *
 * 删除语义与原插件一致：
 * - 冷会话：Remove-Item 整目录（避免 JSONL writer 复活无头日志）;
 * - 活跃会话：需客户端二次确认;
 * - 服务按请求懒解析（ctx.get），规避插件加载顺序导致的 undefined。
 */

export const key = "delete-chat";
export const label = "会话管理";
export const description = "归档会话查看、单条/批量删除会话（合并自 dsh-delete-chat）";
export const defaultEnabled = true;
export const kind = "feature";

function psQuote(value) {
	return "'" + String(value).replace(/'/g, "''") + "'";
}

/**
 * The JSONL backend's locate() returns the transcript FILE; the delete unit
 * is the whole session directory. Refuse anything that does not look like
 * `<...>/session-<id>/session.jsonl[.zstd]` so a wrong backend layout can
 * never turn into a wrong delete.
 */
function sessionDirOf(filePath) {
	const back = filePath.lastIndexOf("\\");
	const sep = back >= 0 ? "\\" : "/";
	const idx = filePath.lastIndexOf(sep);
	if (idx <= 0) return null;
	const fileName = filePath.slice(idx + 1);
	if (fileName !== "session.jsonl.zstd" && fileName !== "session.jsonl") return null;
	const dir = filePath.slice(0, idx);
	const dirBack = dir.lastIndexOf(sep);
	const base = dirBack >= 0 ? dir.slice(dirBack + 1) : dir;
	if (!base.startsWith("session-")) return null;
	return dir;
}

export function register(ctx, api) {
	const fence = api.fence;

	/** Resolve the required services lazily, per request. */
	const services = () => ({
		sessionQuery: ctx.get("sessionQuery"),
		persistence: ctx.get("sessionPersistence"),
		workspaceRegistry: ctx.get("workspaceRegistry"),
		subprocess: ctx.get("subprocess"),
		sandboxPolicy: ctx.get("sandboxPolicy"),
	});

	async function listSessionsJson() {
		const { sessionQuery, workspaceRegistry } = services();
		if (sessionQuery === undefined || workspaceRegistry === undefined) {
			throw new Error("会话服务尚未就绪 (sessionQuery/workspaceRegistry)");
		}
		const records = await sessionQuery.listSessions();
		const archivedSet = new Set(workspaceRegistry.archivedSessionIds);
		// 会话 → 工作区映射：workspaceRegistry 维护 canonical-cwd 头索引，
		// 每个工作区的 sessionIds 即归属该工作区的会话。会话头部只有一个
		// cwd，因此一个会话至多归属一个工作区；未命中者由客户端归入「未分组」。
		const workspaceBySession = new Map();
		for (const ws of workspaceRegistry.list()) {
			for (const sessionId of ws.sessionIds) {
				if (!workspaceBySession.has(sessionId)) {
					workspaceBySession.set(sessionId, { id: ws.id, path: ws.path, title: ws.title });
				}
			}
		}
		const observations = await sessionQuery.readTitleSnapshots(records.map((record) => record.header.id));
		const titleById = new Map();
		for (const item of observations) {
			if (item.status === "fulfilled" && item.value.title !== undefined) titleById.set(item.sessionId, item.value.title);
		}
		return records.map((record) => {
			const title = titleById.get(record.header.id);
			return {
				id: record.header.id,
				title: title === undefined ? null : title.title,
				createdAt: record.header.createdAt,
				live: record.live,
				persisted: record.persisted,
				archived: archivedSet.has(record.header.id),
				workspace: workspaceBySession.get(record.header.id) ?? null,
			};
		});
	}

	async function deleteSession(sessionId, confirmLive) {		if (typeof sessionId !== "string" || sessionId.length === 0) return { ok: false, error: "bad-request" };
		const { sessionQuery, persistence, workspaceRegistry, subprocess, sandboxPolicy } = services();
		if (sessionQuery === undefined || persistence === undefined || workspaceRegistry === undefined) {
			return { ok: false, error: "services-unavailable" };
		}
		const records = await sessionQuery.listSessions();
		const record = records.find((item) => item.header.id === sessionId);
		if (record === undefined) return { ok: false, error: "not-found" };
		if (record.live && !confirmLive) return { ok: false, error: "live-requires-confirm", live: true };
		if (subprocess === undefined) return { ok: false, error: "delete-unavailable" };
		const location = persistence.locate(record.header);
		if (location === undefined) return { ok: false, error: "delete-unavailable" };
		if (location.kind !== "jsonl") return { ok: false, error: "unsupported-backend", kind: location.kind };
		const dir = sessionDirOf(location.path);
		if (dir === null) return { ok: false, error: "bad-location" };

		let exe = "powershell.exe";
		try {
			exe = await subprocess.resolveExecutable("powershell.exe");
		} catch {
			exe = "powershell.exe";
		}
		const cwd = sandboxPolicy === undefined ? "C:\\" : sandboxPolicy.workspaceRoot;
		const command = "Remove-Item -LiteralPath " + psQuote(dir) + " -Recurse -Force -ErrorAction SilentlyContinue";
		const handle = subprocess.spawn({
			argv: [exe, "-NoProfile", "-NonInteractive", "-Command", command],
			cwd,
			stdio: {
				stdin: "ignore",
				stdout: { maxBytes: 8192 },
				stderr: { maxBytes: 8192 },
			},
			graceMs: 30000,
		});
		const outcome = await handle.done;
		const stderrText = handle.collected.stderr === undefined ? "" : handle.collected.stderr.readFrom(0).text;
		if (outcome.exitCode === 0) return { ok: true, live: record.live };
		return { ok: false, error: "rm-failed", exitCode: outcome.exitCode, stderr: String(stderrText).slice(0, 500) };
	}

	/**
	 * Open a workspace folder in Explorer. Security: the path must exactly
	 * match one of the registry's known workspaces — the client can never
	 * ask the host to open an arbitrary directory.
	 */
	async function openFolder(path) {
		const { workspaceRegistry, subprocess, sandboxPolicy } = services();
		if (workspaceRegistry === undefined || subprocess === undefined) return { ok: false, error: "services-unavailable" };
		if (typeof path !== "string" || path.length === 0) return { ok: false, error: "bad-request" };
		const known = workspaceRegistry.list().some((ws) => ws !== null && ws !== undefined && ws.path === path);
		if (!known) return { ok: false, error: "not-a-workspace" };
		if (process.platform !== "win32") return { ok: false, error: "unsupported-platform" };
		let exe = "explorer.exe";
		try {
			exe = await subprocess.resolveExecutable("explorer.exe");
		} catch {
			exe = "explorer.exe";
		}
		const cwd = sandboxPolicy === undefined ? "C:\\" : sandboxPolicy.workspaceRoot;
		try {
			const handle = subprocess.spawn({
				argv: [exe, path],
				cwd,
				stdio: {
					stdin: "ignore",
					stdout: { maxBytes: 2048 },
					stderr: { maxBytes: 2048 },
				},
				graceMs: 15000,
			});
			const outcome = await handle.done;
			if (outcome.exitCode === 0) return { ok: true, path };
			return { ok: false, error: "explorer-failed", exitCode: outcome.exitCode };
		} catch {
			return { ok: false, error: "spawn-failed" };
		}
	}

	const dispose = ctx.webServer.register({
		kind: "prefix",
		path: "/dsh-tools/delete-chat/api",
		handler: async (req, res) => {
			if (!fence(req)) {
				api.writeError(res, "forbidden", "forbidden", 403);
				return;
			}
			if (req.method !== "POST") {
				api.writeError(res, "method-error", "method not allowed", 405);
				return;
			}
			const pathname = new URL(req.url ?? "/", "http://dsh.internal").pathname;
			const prefix = "/dsh-tools/delete-chat/api/";
			const method = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : undefined;
			if (method === undefined || method.includes("/")) {
				api.writeError(res, "not-found", "unknown api method", 404);
				return;
			}
			try {
				const payload = await api.readJsonBody(req);
				if (method === "list") {
					api.writeOk(res, await listSessionsJson());
					return;
				}
				if (method === "delete") {
					const sessionId = payload === null || payload === undefined ? "" : payload.sessionId;
					const confirmLive = payload === null || payload === undefined ? false : payload.confirmLive === true;
					api.writeOk(res, await deleteSession(sessionId, confirmLive));
					return;
				}
				if (method === "open-folder") {
					const path = payload === null || payload === undefined ? "" : payload.path;
					api.writeOk(res, await openFolder(path));
					return;
				}
				api.writeError(res, "not-found", "unknown api method", 404);
			} catch (error) {
				api.writeError(res, "internal", error instanceof Error ? error.message : String(error), 500);
			}
		},
	}, "dsh-tools/delete-chat: routes");

	api.log("delete-chat feature active");
	return () => dispose();
}
