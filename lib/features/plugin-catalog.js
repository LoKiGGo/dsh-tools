/**
 * Feature: plugin-catalog — 插件分类视图（宿主半边）。
 *
 * 为「设置 → 插件」贡献一个分类浏览页（客户端在 settings.plugins.tab
 * 槽注册「插件分类」页签，本模块只提供数据面）：
 *
 *   POST /dsh-tools/api/plugin-catalog
 *
 * 返回当前 loader 条目的投影（与官方 pluginInventory.list 同构：
 * entryId / moduleName / enabled / fiberPhase，跳过 group 条目），
 * 并为每个条目判定来源分类：
 *
 *   official  — 官方插件：安装 Harness 自带（@deepseek-ai/* 及 Harness
 *               传递依赖，如 cordis、cosmokit）
 *   installed — 已安装插件：从插件市场 / GitHub / npm 等来源安装
 *               （profile package.json dependencies 里的非本地引用）
 *   local     — 本地插件：本地开发（link: / file: / 绝对路径引用）
 *
 * 判定规则（纯函数，测试直接断言）：
 *   1. name 为空/缺省                    → local（未命名条目视为用户本地组装）
 *   2. name 以 "@deepseek-ai/" 开头       → official（该 scope 只在 Harness 安装里）
 *   3. name ∈ profile dependencies：
 *        spec 为 link:/file:/绝对路径     → local
 *        其他（github:、URL、semver 等） → installed
 *   4. name ∉ dependencies（余量桶）：
 *        用 createRequire 锚定 profile 探测解析，解析结果落在 profile
 *        目录内 → installed（手工放进 node_modules 的包）；否则 → official。
 *
 * 开关关闭时框架自动 404（feature-disabled），页签也随之注销。
 */

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";

export const key = "plugin-catalog";
export const label = "插件分类视图";
export const description = "「设置 → 插件」新增「插件分类」页：官方 / 已安装 / 本地 分类浏览插件";
export const defaultEnabled = true;
export const kind = "feature";
export const panel = false; // 非面板功能：不在工具箱设置页生成页签

const PROFILE_NAME = "web";

/** Fiber 状态投影，与官方 pluginInventory 网关保持一致。 */
const FIBER_PHASE = {
	0: "pending",
	1: "loading",
	2: "active",
	3: "failed",
	4: null,
	5: "unloading",
};

function homeDir() {
	return process.env.DSH_HOME || join(homedir(), ".dsh");
}

/** 当前 profile 根目录（测试通过临时 DSH_HOME 隔离）。 */
export function profileDir() {
	return join(homeDir(), "profiles", PROFILE_NAME);
}

/**
 * 读取 profile package.json 的 dependencies（name → spec）。
 * 文件缺失或解析失败时返回 {}（调用方按全官方余量桶处理，不抛错）。
 */
export function readProfileDeps(profileRoot) {
	try {
		if (!existsSync(join(profileRoot, "package.json"))) return {};
		const manifest = JSON.parse(readFileSync(join(profileRoot, "package.json"), "utf8"));
		const deps = manifest.dependencies;
		return deps !== null && typeof deps === "object" ? deps : {};
	} catch {
		return {};
	}
}

/** 本地引用 spec 判定：link: / file: / 绝对路径（盘符或 UNC）。 */
export function isLocalSpec(spec) {
	return /^(link|file):/i.test(spec) || /^[A-Za-z]:[\\/]/.test(spec) || /^\\\\/.test(spec);
}

/**
 * 探测某包名是否解析在 profile 目录内（手工放进 node_modules 的包）。
 * 解析失败或落在 profile 外返回 null。
 */
export function probeInstalledPath(name, profileRoot) {
	try {
		const requireFromProfile = createRequire(join(profileRoot, "package.json"));
		const resolved = requireFromProfile.resolve(name);
		if (typeof resolved !== "string" || resolved === "") return null;
		const real = realpathSync(resolved);
		const root = realpathSync(profileRoot);
		const a = real.toLowerCase().replace(/\\/g, "/");
		const b = root.toLowerCase().replace(/\\/g, "/");
		return a.startsWith(b + "/") ? real : null;
	} catch {
		return null;
	}
}

/**
 * 分类判定（纯函数）。
 * @param name - loader 条目包名（moduleName），可能为空。
 * @param deps - profile dependencies 映射（name → spec）。
 * @param profileRoot - profile 根目录（仅余量桶探测用，可省略）。
 * @returns "official" | "installed" | "local"
 */
export function classifyModule(name, deps, profileRoot) {
	if (name === undefined || name === null || name === "") return "local";
	if (name.startsWith("@deepseek-ai/")) return "official";
	if (deps !== undefined && deps !== null) {
		const spec = deps[name];
		if (spec !== undefined && spec !== null) {
			return isLocalSpec(String(spec)) ? "local" : "installed";
		}
	}
	if (typeof profileRoot === "string" && probeInstalledPath(name, profileRoot) !== null) return "installed";
	return "official";
}

/**
 * 把 loader 条目投影为分类快照（跳过 group 条目，与官方网关一致）。
 * @param loader - 宿主 ctx.loader。
 * @param deps - profile dependencies 映射。
 * @param profileRoot - profile 根目录（余量桶探测用）。
 */
export function catalogSnapshot(loader, deps, profileRoot) {
	const entries = [];
	for (const entry of loader.entries()) {
		if (entry.options.group) continue;
		const name = entry.options.name;
		entries.push({
			entryId: entry.id,
			moduleName: name,
			enabled: !entry.disabled,
			fiberPhase: entry.fiber === undefined || entry.fiber === null ? null : FIBER_PHASE[entry.fiber.state],
			category: classifyModule(name, deps, profileRoot),
			spec: deps !== undefined && deps !== null && typeof deps[name] === "string" ? deps[name] : null,
		});
	}
	return { entries };
}

// 宿主 loader 的模块级引用：methods 分发不携带 ctx，register 时捕获。
let loaderRef = null;

export function register(ctx, api) {
	loaderRef = ctx.loader;
	api.log("plugin-catalog active");
	return () => {
		loaderRef = null;
	};
}

export const methods = {
	"plugin-catalog"(req, res, api, payload) {
		const loader = loaderRef;
		if (loader === null || loader === undefined) {
			api.writeError(res, "services-unavailable", "loader service unavailable", 500);
			return;
		}
		try {
			const root = profileDir();
			api.writeOk(res, catalogSnapshot(loader, readProfileDeps(root), root));
		} catch (error) {
			api.writeError(res, "internal", error instanceof Error ? error.message : String(error), 500);
		}
	},
};
