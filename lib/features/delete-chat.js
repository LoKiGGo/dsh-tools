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

import { mkdirSync, writeFileSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const PROFILE_NAME = "web";

function homeDir() {
	return process.env.DSH_HOME || join(homedir(), ".dsh");
}

function pluginsDataDir() {
	return join(homeDir(), "profiles", PROFILE_NAME, "plugins-data");
}

/**
 * Launcher script that opens a folder and brings its Explorer window to the
 * foreground. Runs via `powershell -File` because explorer.exe's exit code is
 * meaningless (with a running desktop Explorer it hands the request off and
 * exits non-zero even though the folder opened) and cannot focus the window.
 */
/** Launcher source: exported so the real-spawn verification and tests reuse it verbatim. */
export const OPEN_FOLDER_PS1 = [
	"param([string]$Path)",
	"$ErrorActionPreference = 'Stop'",
	"$log = Join-Path $PSScriptRoot 'dsh-tools-open-folder-focus.log'",
	"$shell = New-Object -ComObject Shell.Application",
	"$shell.Open($Path) | Out-Null",
	"Add-Type -TypeDefinition @\"",
	"using System;",
	"using System.Runtime.InteropServices;",
	"public static class DshExplorerFocus {",
	"    [DllImport(\"user32.dll\")] public static extern bool SetForegroundWindow(IntPtr hWnd);",
	"    [DllImport(\"user32.dll\")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);",
	"    [DllImport(\"user32.dll\")] public static extern bool BringWindowToTop(IntPtr hWnd);",
	"    [DllImport(\"user32.dll\")] public static extern bool SetFocus(IntPtr hWnd);",
	"    [DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow();",
	"    [DllImport(\"user32.dll\")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);",
	"    [DllImport(\"user32.dll\")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);",
	"    [DllImport(\"user32.dll\")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);",
	"    [DllImport(\"kernel32.dll\")] public static extern uint GetCurrentThreadId();",
	"    [DllImport(\"user32.dll\")] public static extern bool IsIconic(IntPtr hWnd);",
	"    public static bool Force(IntPtr hWnd) {",
	"        bool ok = false;",
	"        try {",
	"            if (IsIconic(hWnd)) ShowWindow(hWnd, 9);",
	"            uint thisThread = GetCurrentThreadId();",
	"            uint dummy;",
	"            uint targetThread = GetWindowThreadProcessId(hWnd, out dummy);",
	"            IntPtr fg = GetForegroundWindow();",
	"            uint fgThread = fg == IntPtr.Zero ? 0 : GetWindowThreadProcessId(fg, out dummy);",
	"            keybd_event(0x12, 0, 0, UIntPtr.Zero);",
	"            keybd_event(0x12, 0, 0x0002, UIntPtr.Zero);",
	"            if (fgThread != 0 && fgThread != thisThread) AttachThreadInput(thisThread, fgThread, true);",
	"            if (targetThread != thisThread) AttachThreadInput(thisThread, targetThread, true);",
	"            BringWindowToTop(hWnd);",
	"            ok = SetForegroundWindow(hWnd);",
	"            try { SetFocus(hWnd); } catch {}",
	"            if (fgThread != 0 && fgThread != thisThread) AttachThreadInput(thisThread, fgThread, false);",
	"            if (targetThread != thisThread) AttachThreadInput(thisThread, targetThread, false);",
	"        } catch {}",
	"        return ok;",
	"    }",
	"}",
	"\"@",
	"$url = ('file:///' + ($Path -replace '\\\\', '/')).TrimEnd('/')",
	"$found = 0",
	"for ($i = 0; $i -lt 8; $i++) {",
	"    foreach ($w in $shell.Windows()) {",
	"        $loc = [string]$w.LocationURL",
	"        if ($loc -ieq $url -or $loc -ieq ($url + '/')) {",
	"            $found++",
	"            $ok = [DshExplorerFocus]::Force($w.HWND)",
	"            if ($ok) {",
	"                ('focused hwnd=' + $w.HWND + ' url=' + $loc) | Out-File -FilePath $log -Encoding utf8",
	"                exit 0",
	"            }",
	"        }",
	"    }",
	"    Start-Sleep -Milliseconds 500",
	"}",
	"('focus-failed found=' + $found + ' url=' + $url) | Out-File -FilePath $log -Encoding utf8",
	"exit 0",
].join("\n");

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

/**
 * Total byte size of a directory tree (symbolic links skipped to avoid
 * cycles; unreadable entries contribute 0; fatal errors return null).
 * Exported for the smoke suite.
 */
export async function dirSize(dirPath) {
	try {
		let total = 0;
		const stack = [dirPath];
		let first = true;
		while (stack.length > 0) {
			const current = stack.pop();
			let entries;
			try {
				entries = await readdir(current, { withFileTypes: true });
			} catch {
				if (first) return null; // 根目录不可读/不存在 → 未知
				continue; // 子目录不可读：跳过，不拖垮整棵树
			}
			first = false;
			for (const entry of entries) {
				const full = join(current, entry.name);
				if (entry.isSymbolicLink()) continue; // 防循环
				if (entry.isDirectory()) {
					stack.push(full);
					continue;
				}
				try {
					const info = await stat(full);
					total += info.size;
				} catch {
					// 单文件不可读：贡献 0
				}
			}
		}
		return total;
	} catch {
		return null;
	}
}

/** Run `fn` over `items` with at most `limit` concurrent promises (null-safe). */
async function mapConcurrent(items, limit, fn) {
	const results = new Array(items.length);
	let cursor = 0;
	const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
		for (;;) {
			const index = cursor++;
			if (index >= items.length) return;
			try {
				results[index] = await fn(items[index], index);
			} catch {
				results[index] = null;
			}
		}
	});
	await Promise.all(workers);
	return results;
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
		const { sessionQuery, persistence, workspaceRegistry } = services();
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
		// 存储占用（v0.7.1）：会话大小 = 其 session-<id> 目录大小（与删除语义一致）；
		// 工作区大小 = 该工作区**所属会话聊天记录**的大小之和（不再统计工作区
		// 目录本身，避免代码工程等大文件干扰）。并发限 8 路；某个会话的目录
		// 不可读时该会话记为未知（null），其所属工作区总和也记为未知。
		// 「无持久化目录」的会话（locate 不到）按占用 0 计，不算未知。
		const sizeBySession = new Map();
		const locateDir = (record) => {
			if (persistence === undefined) return null;
			try {
				const location = persistence.locate(record.header);
				if (location === undefined || location === null || location.kind !== "jsonl") return null;
				return sessionDirOf(location.path);
			} catch {
				return null;
			}
		};
		const sessionSizes = await mapConcurrent(records, 8, async (record) => {
			const dir = locateDir(record);
			if (dir === null) return { bytes: 0, unknown: false }; // 无目录：占用 0
			const bytes = await dirSize(dir);
			return bytes === null ? { bytes: 0, unknown: true } : { bytes, unknown: false };
		});
		for (let i = 0; i < records.length; i++) {
			sizeBySession.set(records[i].header.id, sessionSizes[i]);
		}
		/** 工作区聊天记录总占用：任一所属会话未知 → null；否则为字节和。 */
		const workspaceChatSizeOf = (ws) => {
			let total = 0;
			for (const sessionId of ws.sessionIds) {
				const entry = sizeBySession.get(sessionId);
				if (entry === undefined) continue; // 会话不在当前列表（已删除/未列出）：忽略
				if (entry.unknown) return null;
				total += entry.bytes;
			}
			return total;
		};
		const workspaceList = workspaceRegistry.list();
		return records.map((record) => {
			const title = titleById.get(record.header.id);
			const wsBrief = workspaceBySession.get(record.header.id) ?? null;
			const wsFull = wsBrief === null ? undefined : workspaceList.find((item) => item.id === wsBrief.id);
			const entry = sizeBySession.get(record.header.id) ?? { bytes: 0, unknown: false };
			return {
				id: record.header.id,
				title: title === undefined ? null : title.title,
				createdAt: record.header.createdAt,
				live: record.live,
				persisted: record.persisted,
				archived: archivedSet.has(record.header.id),
				sizeBytes: entry.unknown ? null : entry.bytes,
				workspace: wsBrief === null
					? null
					: {
						...wsBrief,
						sizeBytes: wsFull === undefined ? null : workspaceChatSizeOf(wsFull),
					},
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
	 * Open a workspace folder in Explorer and bring its window to the front.
	 * Security: the path must exactly match one of the registry's known
	 * workspaces — the client can never ask the host to open an arbitrary
	 * directory. Runs a PowerShell launcher script (COM open + user32 focus)
	 * instead of `explorer.exe`: the latter hands the request off to the
	 * running desktop Explorer and exits non-zero even on success.
	 */
	async function openFolder(path) {
		const { workspaceRegistry, subprocess, sandboxPolicy } = services();
		if (workspaceRegistry === undefined || subprocess === undefined) return { ok: false, error: "services-unavailable" };
		if (typeof path !== "string" || path.length === 0) return { ok: false, error: "bad-request" };
		const known = workspaceRegistry.list().some((ws) => ws !== null && ws !== undefined && ws.path === path);
		if (!known) return { ok: false, error: "not-a-workspace" };
		if (process.platform !== "win32") return { ok: false, error: "unsupported-platform" };
		const scriptPath = join(pluginsDataDir(), "dsh-tools-open-folder.ps1");
		try {
			mkdirSync(dirname(scriptPath), { recursive: true });
			writeFileSync(scriptPath, OPEN_FOLDER_PS1, "utf8");
		} catch {
			return { ok: false, error: "script-write-failed" };
		}
		let exe = "powershell.exe";
		try {
			exe = await subprocess.resolveExecutable("powershell.exe");
		} catch {
			exe = "powershell.exe";
		}
		const cwd = sandboxPolicy === undefined ? "C:\\" : sandboxPolicy.workspaceRoot;
		try {
			const handle = subprocess.spawn({
				argv: [exe, "-NoProfile", "-NonInteractive", "-File", scriptPath, "-Path", path],
				cwd,
				stdio: {
					stdin: "ignore",
					stdout: { maxBytes: 4096 },
					stderr: { maxBytes: 4096 },
				},
				graceMs: 20000,
			});
			const outcome = await handle.done;
			if (outcome.exitCode === 0) return { ok: true, path };
			return { ok: false, error: "open-failed", exitCode: outcome.exitCode };
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
