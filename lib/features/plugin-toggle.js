/**
 * Feature: plugin-toggle — 插件开关（合并自 dsh-plugin-toggle）。
 *
 * 数据面路由前缀：/dsh-tools/plugin-toggle/api/{list,set}。启用/停用
 * 语义与原插件一致（bundle 包改 dsh.profile.bundles；普通包增删
 * cordis.patch.yml 的 insert 行），改动在重启 dsh web 后生效，
 * 每次写文件前自动 .bak 备份。
 */

import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const key = "plugin-toggle";
export const label = "插件开关";
export const description = "为 profile 已安装插件提供启用/停用开关（合并自 dsh-plugin-toggle）";
export const defaultEnabled = true;
export const kind = "feature";

const PROFILE_NAME = "web";

function homeDir() {
	return process.env.DSH_HOME || join(homedir(), ".dsh");
}

function profileDir() {
	return join(homeDir(), "profiles", PROFILE_NAME);
}

function manifestPath() {
	return join(profileDir(), "package.json");
}

function patchPath() {
	return join(profileDir(), "cordis.patch.yml");
}

/** Absolute directory a profile-installed package resolves to (scoped-aware). */
function packageDir(packageName) {
	return join(profileDir(), "node_modules", ...packageName.split("/"));
}

/** Row-id slug for packages this feature manages in cordis.patch.yml. */
function slugOf(packageName) {
	return packageName.replace(/^@/, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-{2,}/g, "-").replace(/^-|-$/g, "");
}

function readJson(path) {
	return JSON.parse(readFileSync(path, "utf8"));
}

/** Back up one managed file right before a mutation (overwrites the previous backup). */
function backup(path) {
	try {
		copyFileSync(path, `${path}.bak`);
	} catch {}
}

/** Validate and normalize a package name from the wire. */
function validName(value) {
	const pkgName = String(value ?? "").trim();
	if (!/^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(pkgName)) throw new Error(`无效的包名 ${JSON.stringify(pkgName)}`);
	return pkgName;
}

// --- cordis.patch.yml line-based editing (preserves comments and layout) ---

function readPatch() {
	return existsSync(patchPath()) ? readFileSync(patchPath(), "utf8") : "";
}

/**
 * Split the patch document into top-level blocks. A top-level entry is a
 * column-0 `- <word>:` line (`- insert:`); comments and blanks before the
 * first entry form the preamble.
 */
function splitBlocks(text) {
	const lines = text.split(/\r?\n/);
	const blocks = [];
	let preamble = [];
	let current = null;
	for (const line of lines) {
		if (/^-\s+\w+/.test(line)) {
			if (preamble.length > 0) {
				blocks.push({ preamble });
				preamble = [];
			}
			current = { head: line, tail: [] };
			blocks.push(current);
		} else if (current !== null) {
			current.tail.push(line);
		} else {
			preamble.push(line);
		}
	}
	if (preamble.length > 0) blocks.push({ preamble });
	return blocks;
}

function joinBlock(block) {
	if (block.preamble !== undefined) return block.preamble.join("\n");
	return [block.head, ...block.tail].join("\n");
}

function joinBlocks(blocks) {
	return blocks.map(joinBlock).join("\n");
}

/** Item rows inside one `- insert:` block (4-space `- id: ...` lines). */
function splitItems(block) {
	const items = [];
	let current = null;
	for (const line of block.tail) {
		if (/^    - /.test(line)) {
			current = { lines: [line] };
			items.push(current);
		} else if (current !== null) {
			current.lines.push(line);
		}
	}
	return items;
}

function itemHasName(item, packageName) {
	const quoted = packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const re = new RegExp(`^ {6}name:\\s*['"]?${quoted}['"]?\\s*(#.*)?$`);
	return item.lines.some((line) => re.test(line));
}

/** Every insert item that names this package. */
function findItems(packageName) {
	const blocks = splitBlocks(readPatch());
	const found = [];
	for (const block of blocks) {
		if (block.preamble !== undefined || !/^- insert:/.test(block.head)) continue;
		for (const item of splitItems(block)) {
			if (itemHasName(item, packageName)) found.push(item);
		}
	}
	return found;
}

/** Whether any insert item in the patch names this package. */
function hasRow(packageName) {
	return findItems(packageName).length > 0;
}

/** Remove every insert item naming this package; drop emptied blocks. */
function removeRow(packageName) {
	const blocks = splitBlocks(readPatch());
	const kept = [];
	let removed = false;
	for (const block of blocks) {
		if (block.preamble !== undefined || !/^- insert:/.test(block.head)) {
			kept.push(block);
			continue;
		}
		const items = splitItems(block);
		const survivors = items.filter((item) => !itemHasName(item, packageName));
		if (survivors.length === items.length) {
			kept.push(block);
		} else {
			removed = true;
			if (survivors.length > 0) {
				kept.push({ head: block.head, tail: survivors.flatMap((item) => item.lines) });
			}
		}
	}
	if (removed) writePatch(joinBlocks(kept));
	return removed;
}

function writePatch(text) {
	const path = patchPath();
	backup(path);
	writeFileSync(path, text.trimEnd() + "\n");
}

/**
 * Remove the cordis.patch.yml insert row(s) for one package. Shared with the
 * update-plugin 卸载 flow, which must strip a removed package's activation
 * row so cordis never boots against a missing module.
 */
export function removePatchRow(packageName) {
	return removeRow(packageName);
}

/** Idempotently ensure an enabled insert row for a non-bundle package. */
function ensureRow(packageName) {
	removeRow(packageName); // drop stale/disabled rows first, so the row is exactly ours
	const id = `pm-${slugOf(packageName)}`;
	const block = `- insert:\n    - id: ${id}\n      name: '${packageName}'`;
	const text = readPatch();
	if (/^\s*\[\]\s*$/m.test(text)) {
		writePatch(text.replace(/\[\]/m, block));
	} else if (text.trim() === "") {
		writePatch(block);
	} else {
		writePatch(text.trimEnd() + "\n\n" + block);
	}
}

// --- bundle activation (profile package.json dsh.profile.bundles) ---

/** Add or remove one name from dsh.profile.bundles. Returns whether changed. */
function setBundles(packageName, enabled) {
	const path = manifestPath();
	if (!existsSync(path)) throw new Error("profile package.json 不存在");
	const manifest = readJson(path);
	const bundles = Array.isArray(manifest.dsh?.profile?.bundles) ? [...manifest.dsh.profile.bundles] : [];
	const has = bundles.includes(packageName);
	if (enabled === has) return false;
	backup(path);
	manifest.dsh ??= {};
	manifest.dsh.profile ??= {};
	manifest.dsh.profile.bundles = enabled ? [...bundles, packageName] : bundles.filter((name) => name !== packageName);
	writeFileSync(path, JSON.stringify(manifest, null, 2) + "\n");
	return true;
}

// --- installed-state snapshot ---

/** Snapshot of the profile's installed plugins with their activation state. */
function installedSnapshot() {
	const manifest = existsSync(manifestPath()) ? readJson(manifestPath()) : {};
	const dependencies = manifest.dependencies ?? {};
	const bundles = Array.isArray(manifest.dsh?.profile?.bundles) ? manifest.dsh.profile.bundles : [];
	const plugins = [];
	for (const pkgName of Object.keys(dependencies)) {
		const spec = String(dependencies[pkgName] ?? "");
		let version = "";
		let isBundle = false;
		try {
			const pkg = readJson(join(packageDir(pkgName), "package.json"));
			version = pkg.version ?? "";
			isBundle = pkg.dsh?.bundle?.patch !== undefined;
		} catch {}
		const inBundles = bundles.includes(pkgName);
		const inPatch = hasRow(pkgName);
		plugins.push({
			name: pkgName,
			version: version || spec.replace(/^[\^~]/, ""),
			spec,
			isBundle,
			inBundles,
			inPatch,
			enabled: isBundle ? inBundles : inPatch,
			activation: isBundle ? (inBundles ? "bundles" : "none") : (inPatch ? "patch" : "none"),
		});
	}
	plugins.sort((a, b) => a.name.localeCompare(b.name));
	return { profileDir: profileDir(), bundles, plugins };
}

/** Enable or disable one installed plugin. */
function setEnabled(packageName, enabled) {
	const pkgName = validName(packageName);
	const entry = installedSnapshot().plugins.find((plugin) => plugin.name === pkgName);
	if (entry === undefined) return { ok: false, name: pkgName, error: "该插件不在 profile 依赖里" };
	const want = enabled === true;
	let changed = false;
	if (entry.isBundle) {
		changed = setBundles(pkgName, want);
	} else if (want) {
		ensureRow(pkgName);
		changed = true;
	} else {
		changed = removeRow(pkgName);
	}
	return { ok: true, name: pkgName, enabled: want, isBundle: entry.isBundle, changed, needsRestart: true };
}

export function register(ctx, api) {
	const fence = api.fence;

	const dispose = ctx.webServer.register({
		kind: "prefix",
		path: "/dsh-tools/plugin-toggle/api",
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
			const prefix = "/dsh-tools/plugin-toggle/api/";
			const method = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : undefined;
			if (method === undefined || method.includes("/")) {
				api.writeError(res, "not-found", "unknown api method", 404);
				return;
			}
			try {
				const payload = await api.readJsonBody(req);
				if (method === "list") {
					api.writeOk(res, installedSnapshot());
					return;
				}
				if (method === "set") {
					const pkgName = payload === null || payload === undefined ? "" : payload.name;
					const want = payload === null || payload === undefined ? undefined : payload.enabled;
					const result = setEnabled(pkgName, want);
					if (result.ok === true) api.writeOk(res, result);
					else api.writeError(res, "set-failed", result.error, 500);
					return;
				}
				api.writeError(res, "not-found", "unknown api method", 404);
			} catch (error) {
				api.writeError(res, "internal", error instanceof Error ? error.message : String(error), 500);
			}
		},
	}, "dsh-tools/plugin-toggle: routes");

	api.log("plugin-toggle feature active");
	return () => dispose();
}
