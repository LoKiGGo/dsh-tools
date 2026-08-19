/**
 * Feature: ui.usage — 应用用量统计（融合自
 * https://github.com/yoli-mi/dsh-client-ui-custom，MIT，Copyright (c) 2026 Yoli-mi）。
 *
 * 「dsh 工具箱」独立页签「应用用量」：按时间跨度（今年 / 本月 / 近 7 天 /
 * 近 3 天 / 自定义）与模型过滤聚合各会话用量——总 / 输入 / 输出 token、
 * 缓存命中、使用时长、会话数与步数，带用量趋势柱图、会话用量（Token /
 * 命中率 / 估算费用）与价格配置。
 *
 * 趋势图优先使用 host 侧按自然日聚合的会话日志真实 usage（usage/daily，
 * 带磁盘缓存 + 增量扫描），避免把整个会话累计值记到最后活跃日期；
 * 会话排行仍使用会话列表投影基线。
 */

import { buildDailyUsage } from "./usage-daily.js";

export const key = "ui.usage";
export const label = "应用用量";
export const description = "按时间跨度/模型聚合各会话用量：Token、缓存命中、时长、会话/步数、趋势柱图、会话命中率与估算费用，支持自定义日期与价格配置（融合自 dsh-client-ui-custom）";
export const defaultEnabled = false; // 默认关：不配置时与原生界面一致
export const kind = "feature"; // panel 默认 true：工具箱设置页生成「应用用量」页签

/** 方案A 配置默认值：价格表（元/百万 tokens，默认空闲时段）+ 最近自定义日期。 */
export const defaultConfig = {
	pricing: {
		"deepseek-v4-flash": {
			input: 1.5,
			cacheRead: 0.05,
			cacheWrite: 1.5,
			output: 4.5,
			peak: { input: 3.0, cacheRead: 0.10, cacheWrite: 3.0, output: 9.0 },
		},
		"deepseek-v4-pro": {
			input: 4.5,
			cacheRead: 0.15,
			cacheWrite: 4.5,
			output: 13.5,
			peak: { input: 9.0, cacheRead: 0.30, cacheWrite: 9.0, output: 27.0 },
		},
		"deepseek:deepseek-v4-flash": {
			input: 1.5,
			cacheRead: 0.05,
			cacheWrite: 1.5,
			output: 4.5,
			peak: { input: 3.0, cacheRead: 0.10, cacheWrite: 3.0, output: 9.0 },
		},
		"deepseek:deepseek-v4-pro": {
			input: 4.5,
			cacheRead: 0.15,
			cacheWrite: 4.5,
			output: 13.5,
			peak: { input: 9.0, cacheRead: 0.30, cacheWrite: 9.0, output: 27.0 },
		},
		// 无 byModel / 未知模型时按 DeepSeek V4 Flash 空闲时段估算，避免费用显示 0。
		"default": {
			input: 1.5,
			cacheRead: 0.05,
			cacheWrite: 1.5,
			output: 4.5,
			peak: { input: 3.0, cacheRead: 0.10, cacheWrite: 3.0, output: 9.0 },
		},
	},
	priceMode: "offPeak", // offPeak | peak
	customStart: "",
	customEnd: "",
};

export function register() {
	// client half 自包含；host 侧无事可做。
	return () => {};
}

/** Host 方法：返回按自然日聚合的真实 usage（会话日志 + 缓存 + 增量）。 */
export const methods = {
	async "usage/daily"(req, res, api) {
		try {
			const result = await buildDailyUsage();
			api.writeOk(res, result);
		} catch (error) {
			api.writeError(res, "usage-daily-failed", error instanceof Error ? error.message : String(error));
		}
	},
};
