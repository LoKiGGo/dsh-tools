/**
 * Feature: ui.history — 浮动历史记录条（融合自
 * https://github.com/yoli-mi/dsh-client-ui-custom，MIT，Copyright (c) 2026 Yoli-mi）。
 *
 * 开启后，在会话内容区左右边缘浮动一条「历史条」：每条竖线代表一个用户
 * 回合，悬停成波浪高亮、点击平滑滚动到对应消息；支持「悬挂」（在消息操作
 * 行把某回合固定到历史条，忽略数量限制）。位置（left/right/off）与显示
 * 回合数（0 = 全部）在「界面增强」页签配置，配置存 dsh-tools featureConfig。
 * 全部实现都在 client half（details slot + assistant-actions slot）；host 无
 * 命令/服务——本模块只提供 feature 元数据、默认配置与空 register。
 */

export const key = "ui.history";
export const label = "浮动历史条";
export const description = "会话内容区边缘浮动历史记录条：悬停高亮、点击跳转对应回合，支持悬挂（融合自 dsh-client-ui-custom）";
export const defaultEnabled = false; // 默认关：不配置时与原生界面一致
export const panel = false; // 设置并入「界面增强」页签
export const kind = "feature";

/** 方案A 配置默认值（featureConfig 合并基底）。 */
export const defaultConfig = {
	historyPosition: "off", // left / right / off
	historyLimit: 10, // 0 = 全部
	pinnedTurns: {}, // sessionId -> turn 数组（悬挂）
};

export function register() {
	// client half 自包含；host 侧无事可做。
	return () => {};
}
