/**
 * Feature: update-plugin — 更新检查（合并自 dsh-update-plugin）。
 *
 * 数据面路由前缀：/dsh-tools/update-plugin/api/{check,update,uninstall}。对 profile
 * package.json 依赖做版本检查：npm 注册表 spec 用 `npm view` 查最新版，
 * GitHub 安装（`github:owner/repo` 或 github.com 下载/archive URL）用
 * GitHub Releases API 探测最新 tag（无 Release 时回退 tags 列表）；
 * 其余本地/远程引用（link:/file:/workspace:/git+:/其他 URL）跳过。
 * 更新统一走 pnpm add（profile 的 node_modules 由 pnpm 管理），
 * github: spec 更新为 `github:owner/repo#tag` 固定版本，URL spec 更新为
 * GitHub archive tarball URL。卸载走 pnpm remove，并同步清理激活层
 * （dsh.profile.bundles + cordis.patch.yml 激活行）。更新/卸载在重启
 * dsh web 后生效。
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { parseGithubSpec as parseGitHubSpec, githubUrlOf } from "./github-ref.js";
import { removePatchRow } from "./plugin-toggle.js";

export const key = "update-plugin";
export const label = "更新检查";
export const description = "检查并更新 profile 已安装插件（合并自 dsh-update-plugin）";
export const defaultEnabled = true;
export const kind = "feature";

const PROFILE_NAME = "web";
const VIEW_TIMEOUT_MS = 30 * 1000;
const INSTALL_TIMEOUT_MS = 5 * 60 * 1000;
const OUTPUT_CAP = 65536;

function homeDir() {
	return process.env.DSH_HOME || join(homedir(), ".dsh");
}

function profileDir() {
	return join(homeDir(), "profiles", PROFILE_NAME);
}

function manifestPath() {
	return join(profileDir(), "package.json");
}

/** Absolute directory a profile-installed package resolves to (scoped-aware). */
function packageDir(name) {
	return join(profileDir(), "node_modules", ...name.split("/"));
}

// --- CLI drivers (npm for registry queries, pnpm for profile mutation) ---

/**
 * The npm CLI to drive. Prefer the bundled copy beside the bundled node
 * runtime (packaged: resources/npm; dev: vendor/npm) and fall back to npm on
 * PATH when that copy is absent.
 */
function npmCommand() {
	const bundled = join(dirname(process.execPath), "..", "npm", "bin", "npm-cli.js");
	if (existsSync(bundled)) return { file: process.execPath, prefix: [bundled], shell: false };
	return { file: process.platform === "win32" ? "npm.cmd" : "npm", prefix: [], shell: true };
}

/**
 * The pnpm CLI to drive (the profile's node_modules is pnpm-managed, so
 * installs/updates must go through pnpm — the same tool the `dsh plugin`
 * CLI forwards to).
 */
function pnpmCommand() {
	return { file: process.platform === "win32" ? "pnpm.cmd" : "pnpm", prefix: [], shell: process.platform === "win32" };
}

/**
 * Run one CLI invocation in the profile directory, collecting capped output.
 * @param cmd - { file, prefix, shell } from npmCommand()/pnpmCommand().
 * @param args - CLI arguments after the script.
 * @param timeoutMs - hard timeout; resolves with a timed-out settlement.
 * @returns settlement { code, stdout, stderr, error?, timedOut? }.
 */
function runProcess(cmd, args, timeoutMs) {
	return new Promise((resolve) => {
		const child = spawn(cmd.file, [...cmd.prefix, ...args], {
			cwd: profileDir(),
			env: process.env,
			windowsHide: true,
			stdio: ["ignore", "pipe", "pipe"],
			shell: cmd.shell
		});
		const out = { stdout: "", stderr: "" };
		const feed = (key) => (chunk) => {
			const text = chunk.toString();
			const keep = OUTPUT_CAP - out[key].length;
			if (keep > 0) out[key] += text.slice(0, keep);
		};
		child.stdout.on("data", feed("stdout"));
		child.stderr.on("data", feed("stderr"));
		let settled = false;
		const settle = (value) => {
			if (!settled) {
				settled = true;
				resolve(value);
			}
		};
		const timer = setTimeout(() => {
			try { child.kill(); } catch {}
			settle({ code: null, stdout: out.stdout, stderr: out.stderr, timedOut: true, error: "命令执行超时" });
		}, timeoutMs);
		child.on("error", (error) => {
			clearTimeout(timer);
			settle({ code: null, stdout: out.stdout, stderr: out.stderr, error: String((error && error.message) || error) });
		});
		child.on("exit", (code) => {
			clearTimeout(timer);
			settle({ code, stdout: out.stdout, stderr: out.stderr });
		});
	});
}

function runNpm(args, timeoutMs) {
	return runProcess(npmCommand(), args, timeoutMs);
}

function runPnpm(args, timeoutMs) {
	return runProcess(pnpmCommand(), args, timeoutMs);
}

// --- installed-state helpers ---

function readJson(path) {
	return JSON.parse(readFileSync(path, "utf8"));
}

/**
 * Classify a dependency spec for update checking.
 * @returns "registry" (npm view), "github" (GitHub API), or "skip".
 */
function classifySpec(spec) {
	const text = String(spec ?? "").trim();
	if (text === "") return "registry"; // empty spec = registry "*"
	if (/^github:/i.test(text)) return "github";
	if (/^https?:\/\/(www\.)?github\.com\//i.test(text)) return "github";
	if (/^(link:|file:|git\+|git:|workspace:)/.test(text)) return "skip";
	if (/^https?:\/\//.test(text)) return "skip";
	if (/^(\.{1,2}[\\/]|[A-Za-z]:[\\/]|[\\/])/.test(text)) return "skip";
	return "registry";
}

/** Strip common tag prefixes ("v0.3.1" → "0.3.1", "release-0.3.1" → "0.3.1"). */
function versionFromTag(tag) {
	return String(tag ?? "").trim().replace(/^[^\d]*/, "");
}

const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_TIMEOUT_MS = 15 * 1000;

/**
 * Probe the latest release tag of a GitHub repo via the public API.
 * Falls back to the tags list when the repo has no releases.
 * @returns { tag } on success or { error } on failure.
 */
async function githubLatestTag(owner, repo) {
	const headers = { accept: "application/vnd.github+json", "user-agent": "dsh-tools-update-check" };
	const get = async (path) => {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), GITHUB_TIMEOUT_MS);
		try {
			return await fetch(GITHUB_API_BASE + path, { headers, signal: controller.signal });
		} finally {
			clearTimeout(timer);
		}
	};
	try {
		const latest = await get(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/latest`);
		if (latest.ok) {
			const body = await latest.json();
			if (body !== null && typeof body === "object" && typeof body.tag_name === "string" && body.tag_name !== "") {
				return { tag: body.tag_name };
			}
			return { error: `GitHub API 响应缺少 tag_name: ${JSON.stringify(body).slice(0, 120)}` };
		}
		if (latest.status !== 404) {
			return { error: `GitHub API 返回 ${latest.status}（未认证每小时限 60 次请求）` };
		}
		// No releases → fall back to the tags list.
		const tags = await get(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tags`);
		if (tags.ok) {
			const body = await tags.json();
			if (Array.isArray(body) && body.length > 0 && body[0] !== null && typeof body[0] === "object" && typeof body[0].name === "string") {
				return { tag: body[0].name };
			}
		}
		return { error: `仓库 ${owner}/${repo} 没有 GitHub Release 或 tag` };
	} catch (error) {
		return { error: `GitHub API 请求失败：${String((error && error.message) || error)}` };
	}
}

/**
 * Build the pnpm spec that pins a GitHub install to an exact tag:
 * `github:` specs stay in that form (`github:owner/repo#tag`); URL specs
 * become GitHub's stable archive tarball URL (valid for any tag).
 */
function buildUpdateSpec(spec, tag) {
	const ref = parseGitHubSpec(spec);
	if (ref === null) return null;
	if (/^github:/i.test(String(spec ?? "").trim())) return `github:${ref.owner}/${ref.repo}#${tag}`;
	return `https://github.com/${ref.owner}/${ref.repo}/archive/refs/tags/${encodeURIComponent(tag)}.tar.gz`;
}

/** Numeric-ish segment comparison for simple semver strings. */
function compareVersions(a, b) {
	const pa = String(a).split(/[.+-]/);
	const pb = String(b).split(/[.+-]/);
	const len = Math.max(pa.length, pb.length);
	for (let i = 0; i < len; i++) {
		const ra = pa[i] === undefined ? "" : pa[i];
		const rb = pb[i] === undefined ? "" : pb[i];
		const na = /^\d+$/.test(ra) ? Number(ra) : null;
		const nb = /^\d+$/.test(rb) ? Number(rb) : null;
		if (na !== null && nb !== null) {
			if (na !== nb) return na < nb ? -1 : 1;
		} else {
			const c = ra.localeCompare(rb);
			if (c !== 0) return c < 0 ? -1 : 1;
		}
	}
	return 0;
}

/** Snapshot of what the web profile currently has installed (user-managed). */
function installedSnapshot() {
	const manifest = existsSync(manifestPath()) ? readJson(manifestPath()) : {};
	const dependencies = manifest.dependencies ?? {};
	const entries = [];
	for (const pkgName of Object.keys(dependencies)) {
		const spec = String(dependencies[pkgName] ?? "");
		const kind = classifySpec(spec);
		const skip = kind === "skip";
		let pkg = null;
		try {
			pkg = readJson(join(packageDir(pkgName), "package.json"));
		} catch {}
		const version = pkg === null ? "" : (pkg.version ?? "");
		entries.push({
			name: pkgName,
			spec,
			version: version || spec.replace(/^[\^~]/, ""),
			skip,
			kind,
			home: githubUrlOf(spec, pkg),
		});
	}
	entries.sort((a, b) => a.name.localeCompare(b.name));
	return { profileDir: profileDir(), plugins: entries };
}

/** Validate and normalize a package name from the wire. */
function validName(value) {
	const pkgName = String(value ?? "").trim();
	if (!/^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(pkgName)) throw new Error(`无效的包名 ${JSON.stringify(pkgName)}`);
	return pkgName;
}

/** First useful CLI failure text (stderr wins, then stdout, then the code). */
function cliFailure(run, verb) {
	return (run.error || run.stderr || run.stdout || `${verb} 失败 (exit ${run.code})`).trim().slice(0, 800);
}

/** One in-flight npm operation at a time. */
let busy = false;
async function withBusy(operation) {
	if (busy) throw new Error("另一个更新操作正在进行中，请稍候再试");
	busy = true;
	try {
		return await operation();
	} finally {
		busy = false;
	}
}

// --- API actions ---

/**
 * Check every installed profile plugin against its version source.
 * Registry specs get `npm view <name> version`; GitHub installs get the
 * latest release/tag via the GitHub API; everything else is reported skipped.
 */
function checkPlugins() {
	return withBusy(async () => {
		const snapshot = installedSnapshot();
		const registry = snapshot.plugins.filter((plugin) => plugin.kind === "registry");
		const github = snapshot.plugins.filter((plugin) => plugin.kind === "github");
		const views = await Promise.all(registry.map((plugin) =>
			runNpm(["view", plugin.name, "version"], VIEW_TIMEOUT_MS).then((run) => ({ plugin, run }))
		));
		const ghProbes = await Promise.all(github.map(async (plugin) => {
			const ref = parseGitHubSpec(plugin.spec);
			if (ref === null) return { plugin, tag: "", error: `无法解析 GitHub spec: ${plugin.spec}` };
			const probe = await githubLatestTag(ref.owner, ref.repo);
			return { plugin, tag: probe.tag ?? "", error: probe.error ?? "" };
		}));
		const items = [];
		for (const { plugin, run } of views) {
			let latest = "";
			let error = "";
			if (run.code === 0) {
				const token = run.stdout.trim().split(/\s+/)[0];
				if (/^\d/.test(token)) latest = token;
				else error = `npm view 返回了无法解析的结果: ${run.stdout.trim().slice(0, 120)}`;
			} else {
				error = cliFailure(run, "npm view");
			}
			items.push({
				name: plugin.name,
				spec: plugin.spec,
				home: plugin.home ?? null,
				current: plugin.version,
				latest,
				outdated: latest !== "" && plugin.version !== "" && compareVersions(plugin.version, latest) < 0,
				error: error === "" ? "" : error,
				skip: false,
				kind: "registry"
			});
		}
		for (const { plugin, tag, error } of ghProbes) {
			const latest = error === "" ? versionFromTag(tag) : "";
			items.push({
				name: plugin.name,
				spec: plugin.spec,
				home: plugin.home ?? null,
				current: plugin.version,
				latest,
				outdated: latest !== "" && plugin.version !== "" && compareVersions(plugin.version, latest) < 0,
				error: error === "" ? "" : error,
				skip: false,
				kind: "github"
			});
		}
		for (const plugin of snapshot.plugins) {
			if (plugin.skip) {
				items.push({
					name: plugin.name,
					spec: plugin.spec,
					home: plugin.home ?? null,
					current: plugin.version,
					latest: "",
					outdated: false,
					error: "",
					skip: true,
					kind: "skip"
				});
			}
		}
		items.sort((a, b) => a.name.localeCompare(b.name));
		return { plugins: items, checkedAt: Date.now() };
	});
}

/**
 * Update one profile plugin to the latest version of its source:
 * registry installs resolve the version explicitly (`npm view`) and pass it
 * as an exact spec to `pnpm add` (pnpm's minimum-release-age dist-tag policy
 * cannot block it); GitHub installs probe the latest release/tag and pin it
 * via `github:owner/repo#tag` or the archive tarball URL.
 * @param packageName - exact package name from the check results.
 */
function updatePlugin(packageName) {
	return withBusy(async () => {
		const pkgName = validName(packageName);
		const snapshot = installedSnapshot();
		const entry = snapshot.plugins.find((plugin) => plugin.name === pkgName);
		if (entry === undefined) return { ok: false, name: pkgName, error: "该插件不在 profile 依赖里" };
		if (entry.skip) return { ok: false, name: pkgName, error: "本地/远程引用安装的插件不支持自动更新" };
		let target = "";
		if (entry.kind === "github") {
			const ref = parseGitHubSpec(entry.spec);
			if (ref === null) return { ok: false, name: pkgName, error: `无法解析 GitHub spec: ${entry.spec}` };
			const probe = await githubLatestTag(ref.owner, ref.repo);
			if (probe.error !== undefined) return { ok: false, name: pkgName, error: probe.error };
			const spec = buildUpdateSpec(entry.spec, probe.tag);
			if (spec === null) return { ok: false, name: pkgName, error: "无法构造 GitHub 更新 spec" };
			target = spec;
		} else {
			const view = await runNpm(["view", pkgName, "version"], VIEW_TIMEOUT_MS);
			let latest = "";
			if (view.code === 0) {
				const token = view.stdout.trim().split(/\s+/)[0];
				if (/^\d/.test(token)) latest = token;
			}
			if (latest === "") return { ok: false, name: pkgName, error: `无法解析 ${pkgName} 的最新版本：${cliFailure(view, "npm view")}` };
			target = `${pkgName}@${latest}`;
		}
		const run = await runPnpm(["add", target], INSTALL_TIMEOUT_MS);
		if (run.code !== 0) return { ok: false, name: pkgName, error: cliFailure(run, "pnpm add") };
		let version = "";
		let isBundle = false;
		try {
			const pkg = readJson(join(packageDir(pkgName), "package.json"));
			version = pkg.version ?? "";
			isBundle = pkg.dsh?.bundle?.patch !== undefined;
		} catch {}
		reconcileBundle(pkgName, isBundle);
		return { ok: true, name: pkgName, version, isBundle, needsRestart: true };
	});
}

/**
 * Uninstall one profile plugin: `pnpm remove`, then keep the activation
 * layer in sync (drop it from dsh.profile.bundles and strip its
 * cordis.patch.yml insert row) so cordis never boots against a missing
 * module. dsh-tools itself is refused — the settings UI lives in it.
 * @param packageName - exact package name from the check results.
 * @param runner - injectable pnpm runner (test hook); defaults to runPnpm.
 */
function uninstallPlugin(packageName, runner) {
	const run = runner === undefined ? runPnpm : runner;
	return withBusy(async () => {
		const pkgName = validName(packageName);
		// 无条件自保护：无论依赖表里有没有 dsh-tools，都不允许通过本 API 卸载。
		if (pkgName === "dsh-tools") return { ok: false, name: pkgName, error: "不能卸载 dsh-tools 自身（设置页所在插件）" };
		const snapshot = installedSnapshot();
		const entry = snapshot.plugins.find((plugin) => plugin.name === pkgName);
		if (entry === undefined) return { ok: false, name: pkgName, error: "该插件不在 profile 依赖里" };
		const result = await run(["remove", pkgName], INSTALL_TIMEOUT_MS);
		if (result.code !== 0) return { ok: false, name: pkgName, error: cliFailure(result, "pnpm remove") };
		reconcileBundle(pkgName, false);
		removePatchRow(pkgName);
		return { ok: true, name: pkgName, needsRestart: true };
	});
}

/**
 * Keep dsh.profile.bundles in sync with the updated package's bundle
 * declaration — the same reconciliation `dsh plugin` runs after pnpm.
 */
function reconcileBundle(pkgName, isBundle) {
	const path = manifestPath();
	if (!existsSync(path)) return;
	const manifest = readJson(path);
	const bundles = Array.isArray(manifest.dsh?.profile?.bundles) ? manifest.dsh.profile.bundles : [];
	const changed = isBundle ? !bundles.includes(pkgName) : bundles.includes(pkgName);
	if (!changed) return;
	manifest.dsh ??= {};
	manifest.dsh.profile ??= {};
	manifest.dsh.profile.bundles = isBundle
		? [...bundles, pkgName]
		: bundles.filter((bundleName) => bundleName !== pkgName);
	writeFileSync(path, JSON.stringify(manifest, null, 2) + "\n");
}

export function register(ctx, api) {
	const fence = api.fence;

	const dispose = ctx.webServer.register({
		kind: "prefix",
		path: "/dsh-tools/update-plugin/api",
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
			const prefix = "/dsh-tools/update-plugin/api/";
			const method = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : undefined;
			if (method === undefined || method.includes("/")) {
				api.writeError(res, "not-found", "unknown api method", 404);
				return;
			}
			try {
				const payload = await api.readJsonBody(req);
				if (method === "check") {
					api.writeOk(res, await checkPlugins());
					return;
				}
				if (method === "update") {
					const packageName = payload === null || payload === undefined ? "" : payload.packageName;
					const result = await updatePlugin(packageName);
					if (result.ok === true) api.writeOk(res, result);
					else api.writeError(res, "update-failed", result.error, 500);
					return;
				}
				if (method === "uninstall") {
					const packageName = payload === null || payload === undefined ? "" : payload.packageName;
					const result = await uninstallPlugin(packageName);
					if (result.ok === true) api.writeOk(res, result);
					else api.writeError(res, "uninstall-failed", result.error, 500);
					return;
				}
				api.writeError(res, "not-found", "unknown api method", 404);
			} catch (error) {
				api.writeError(res, "internal", error instanceof Error ? error.message : String(error), 500);
			}
		},
	}, "dsh-tools/update-plugin: routes");

	api.log("update-plugin feature active");
	return () => dispose();
}

// --- test-only exports (pure helpers; the smoke suite asserts them without a DOM) ---

export { classifySpec, parseGitHubSpec, versionFromTag, buildUpdateSpec, githubLatestTag, uninstallPlugin };
