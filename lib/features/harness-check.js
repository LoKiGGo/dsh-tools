/**
 * Feature: harness.check — DeepSeek Harness 版本检查（仅检查，不升级）。
 *
 * 在「功能开关」页签顶部、「一键重启 dsh web」上方显示一张卡片：当前
 * DeepSeek Harness 版本 vs GitHub deepseek-ai/deepseek-harness 最新
 * Release/tag。只做检查，不提供升级入口。
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { githubLatestTag, versionFromTag, compareVersions } from "./github-ref.js";

export const key = "harness.check";
export const label = "DeepSeek Harness 版本检查";
export const description = "检查 DeepSeek Harness 是否有新版本（仅检查，不提供升级）";
export const defaultEnabled = true;
export const alwaysOn = true; // 常驻卡片，无开关
export const panel = false; // 无独立设置面板
export const kind = "feature";

const REPO_OWNER = "deepseek-ai";
const REPO_NAME = "deepseek-harness";

/** Read version from a package.json path; null when absent/invalid. */
export function readHarnessVersionFromPackage(packageJsonPath) {
	try {
		if (!existsSync(packageJsonPath)) return null;
		const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
		if (typeof pkg.version === "string" && pkg.version !== "") return pkg.version;
	} catch {}
	return null;
}

/** Read version from the global dsh CLI package beside process.execPath. */
export function readHarnessVersionFromExecPath(execPath = process.execPath) {
	return readHarnessVersionFromPackage(join(dirname(execPath), "node_modules", "@deepseek-ai", "dsh", "package.json"));
}

/**
 * Read version from the running dsh CLI script path (process.argv[1]).
 * When dsh web is launched as `node .../node_modules/@deepseek-ai/dsh/lib/bin.js web`,
 * the package root is two directories above the script.
 */
export function readHarnessVersionFromArgv(argv = process.argv) {
	const script = argv && Array.isArray(argv) ? argv[1] : undefined;
	if (typeof script !== "string" || script === "") return null;
	return readHarnessVersionFromPackage(join(dirname(dirname(script)), "package.json"));
}

/** Read version from `npm root -g` + @deepseek-ai/dsh/package.json. */
export function readHarnessVersionFromNpmRoot() {
	const run = process.platform === "win32"
		? spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "npm root -g"], { encoding: "utf8", windowsHide: true })
		: spawnSync("npm", ["root", "-g"], { encoding: "utf8" });
	if (run.status !== 0) return null;
	const root = String(run.stdout ?? "").trim();
	if (root === "") return null;
	return readHarnessVersionFromPackage(join(root, "@deepseek-ai", "dsh", "package.json"));
}

/** Read version from `dsh --version`; null on failure. */
export function readHarnessVersionFromCli() {
	const run = process.platform === "win32"
		? spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "dsh --version"], { encoding: "utf8", windowsHide: true })
		: spawnSync("dsh", ["--version"], { encoding: "utf8" });
	if (run.status !== 0) return null;
	const token = String(run.stdout ?? "").trim().split(/\s+/)[0];
	return token === "" ? null : token;
}

/** Discover the current DeepSeek Harness version, with test override support. */
export function discoverHarnessVersion() {
	const forced = process.env.DSH_TOOLS_HARNESS_VERSION;
	if (typeof forced === "string" && forced !== "") return forced;
	const fromExec = readHarnessVersionFromExecPath();
	if (fromExec !== null) return fromExec;
	const fromArgv = readHarnessVersionFromArgv();
	if (fromArgv !== null) return fromArgv;
	const fromNpmRoot = readHarnessVersionFromNpmRoot();
	if (fromNpmRoot !== null) return fromNpmRoot;
	return readHarnessVersionFromCli();
}

/** Full check result: current vs latest, no upgrade action. */
export async function checkHarnessVersion() {
	const current = discoverHarnessVersion() || "";
	const probe = await githubLatestTag(REPO_OWNER, REPO_NAME);
	const error = probe.error ?? "";
	const latest = error === "" ? versionFromTag(probe.tag ?? "") : "";
	return {
		current,
		latest,
		outdated: latest !== "" && current !== "" && compareVersions(current, latest) < 0,
		error,
	};
}

export function register() {
	return () => {};
}

export const methods = {
	async "harness-check"(req, res, api) {
		api.writeOk(res, await checkHarnessVersion());
	},
};
