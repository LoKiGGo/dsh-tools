/**
 * Shared GitHub reference helpers (update-plugin / plugin-toggle 共用)。
 *
 * - parseGithubSpec: 与 update-plugin 相同的 github: / git+https github.com /
 *   github.com URL spec 解析（迁移自 update-plugin.js，单一出处）；
 * - githubUrlOf: 从依赖 spec 或已安装包 package.json 的 repository 字段推导
 *   可点击的 GitHub 主页 URL，推导不出返回 null（客户端保持原样不可点）；
 * - githubRepoDescription: 通过 GitHub API 探测仓库 description（静默失败）。
 */

const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_TIMEOUT_MS = 4 * 1000;

/**
 * Parse a GitHub install spec into { owner, repo, tag? }. Accepts
 * `github:owner/repo[#tag]` and github.com URLs (releases/download,
 * archive/refs/tags, releases/tag, or a bare repo URL). Returns null
 * when the spec is not a GitHub reference.
 */
export function parseGithubSpec(spec) {
	const text = String(spec ?? "").trim();
	let owner = "", repo = "", tag;
	if (/^github:/i.test(text)) {
		const rest = text.slice(7);
		const [pathPart, tagPart] = rest.split("#", 2);
		const seg = pathPart.split("/");
		if (seg.length < 2 || seg[0] === "" || seg[1] === "") return null;
		owner = seg[0];
		repo = seg[1];
		if (tagPart !== undefined && tagPart !== "") tag = tagPart;
	} else {
		const m = /^(?:git\+)?https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/#?]+)/i.exec(text);
		if (m === null) return null;
		owner = m[1];
		repo = m[2];
		const hash = text.split("#", 2)[1];
		if (hash !== undefined && hash !== "") {
			tag = hash;
		} else {
			const tm = /(?:releases\/download\/|archive\/refs\/tags\/|releases\/tag\/)([^/?#]+)/i.exec(text);
			if (tm !== null) tag = tm[1];
		}
	}
	if (owner === "" || repo === "") return null;
	repo = repo.replace(/\.git$/i, "");
	return { owner, repo, tag };
}

/** Normalize one repository URL (git+https / ssh / https, optional .git) to a GitHub homepage URL, or null. */
function repoUrlToGithub(url) {
	const u = String(url ?? "").trim();
	const https = /^(?:git\+)?https?:\/\/(?:www\.)?github\.com\/([^/?#]+)\/([^/?#]+?)(?:\.git)?\/?$/i.exec(u);
	if (https !== null) return `https://github.com/${https[1]}/${https[2]}`;
	const ssh = /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?\/?$/i.exec(u);
	if (ssh !== null) return `https://github.com/${ssh[1]}/${ssh[2]}`;
	return null;
}

/** Strip common tag prefixes ("v0.3.1" → "0.3.1", "release-0.3.1" → "0.3.1"). */
export function versionFromTag(tag) {
	return String(tag ?? "").trim().replace(/^[^\d]*/, "");
}

/** Numeric-ish segment comparison for simple semver strings. */
export function compareVersions(a, b) {
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

const GITHUB_LATEST_TIMEOUT_MS = 15 * 1000;

/**
 * Probe the latest release tag of a GitHub repo via the public API.
 * Falls back to the tags list when the repo has no releases.
 * @returns { tag } on success or { error } on failure.
 */
export async function githubLatestTag(owner, repo) {
	const headers = { accept: "application/vnd.github+json", "user-agent": "dsh-tools-update-check" };
	const get = async (path) => {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), GITHUB_LATEST_TIMEOUT_MS);
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
 * GitHub homepage URL for one plugin, derived from its dependency spec or the
 * installed package's `repository` field. Returns null when no GitHub page is
 * known — the UI then keeps the current (non-clickable) rendering.
 *
 * @param spec - profile dependency spec (github:, github.com URL, link:, semver…)
 * @param installed - the installed package.json object, or null/undefined
 */
export function githubUrlOf(spec, installed) {
	const text = String(spec ?? "").trim();
	if (text !== "") {
		const ref = parseGithubSpec(text);
		if (ref !== null) return `https://github.com/${ref.owner}/${ref.repo}`;
	}
	if (installed !== null && installed !== undefined && typeof installed === "object") {
		const repo = installed.repository;
		if (repo !== null && repo !== undefined && repo !== "") {
			if (typeof repo === "string") {
				const url = repoUrlToGithub(repo);
				if (url !== null) return url;
			} else if (typeof repo === "object" && typeof repo.url === "string") {
				const url = repoUrlToGithub(repo.url);
				if (url !== null) return url;
			}
		}
	}
	return null;
}

/**
 * Probe a GitHub repo's `description` via the public API. Returns the
 * description string, or "" on any failure (network/timeout/non-ok/absent) —
 * callers treat "" as "no description", never as an error.
 */
export async function githubRepoDescription(owner, repo) {
	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), GITHUB_TIMEOUT_MS);
		let body = null;
		try {
			const response = await fetch(
				`${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
				{ headers: { accept: "application/vnd.github+json", "user-agent": "dsh-tools-plugin-toggle" }, signal: controller.signal },
			);
			if (!response.ok) return "";
			body = await response.json();
		} finally {
			clearTimeout(timer);
		}
		if (body !== null && typeof body === "object" && typeof body.description === "string") return body.description;
		return "";
	} catch {
		return "";
	}
}

/**
 * Probe an npm package's `description` via the public registry metadata.
 * Returns the description string, or "" on any failure.
 */
export async function npmPackageDescription(name) {
	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), GITHUB_TIMEOUT_MS);
		let body = null;
		try {
			const response = await fetch(
				`https://registry.npmjs.org/${String(name).replace(/\//g, "%2F")}`,
				{ headers: { accept: "application/json", "user-agent": "dsh-tools-plugin-toggle" }, signal: controller.signal },
			);
			if (!response.ok) return "";
			body = await response.json();
		} finally {
			clearTimeout(timer);
		}
		if (body !== null && typeof body === "object" && typeof body.description === "string") return body.description;
		return "";
	} catch {
		return "";
	}
}

/** True when the text contains CJK ideographs (a Chinese description). */
export function isChinese(text) {
	return /[\u3400-\u9fff]/.test(String(text ?? ""));
}

/**
 * Order description candidates for display: Chinese first, then the rest,
 * deduplicated, empties dropped. The first entry is the preferred one.
 */
export function orderDescriptions(candidates) {
	const seen = new Set();
	const out = [];
	for (const candidate of candidates) {
		const text = String(candidate ?? "").trim();
		if (text === "" || seen.has(text)) continue;
		seen.add(text);
		out.push(text);
	}
	out.sort((a, b) => {
		const ac = isChinese(a) ? 0 : 1;
		const bc = isChinese(b) ? 0 : 1;
		if (ac !== bc) return ac - bc;
		return a < b ? -1 : a > b ? 1 : 0;
	});
	return out;
}
