/**
 * Feature: ui.usage — 应用用量统计（融合自
 * https://github.com/yoli-mi/dsh-client-ui-custom，MIT，Copyright (c) 2026 Yoli-mi）。
 *
 * 「dsh 工具箱」独立页签「应用用量」：按时间跨度（今年 / 本月 / 近 7 天 /
 * 近 3 天）与模型过滤聚合各会话用量——总 / 输入 / 输出 token、缓存命中、
 * 使用时长、会话数与步数，带用量趋势柱图与会话排行。数据来自会话列表行
 * 已携带的 Host 投影基线（tokenUsage / sessionStats），纯客户端聚合、无
 * 额外 RPC。全部实现都在 client half；host 无命令/服务——本模块只提供
 * feature 元数据与空 register。
 */

export const key = "ui.usage";
export const label = "应用用量";
export const description = "按时间跨度与模型聚合各会话用量：Token、缓存命中、时长、会话/步数，趋势柱图与会话排行（融合自 dsh-client-ui-custom）";
export const defaultEnabled = false; // 默认关：不配置时与原生界面一致
export const kind = "feature"; // panel 默认 true：工具箱设置页生成「应用用量」页签

export function register() {
	// client half 自包含；host 侧无事可做。
	return () => {};
}
