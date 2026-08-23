/**
 * Feature: ui.enhance — 界面增强（融合自
 * https://github.com/yoli-mi/dsh-client-ui-custom，MIT，Copyright (c) 2026 Yoli-mi）。
 *
 * 单一开关收纳两个界面增强子功能（v0.7.1 起由 ui.markdown + ui.history
 * 合并而来，配置 key 统一走本功能的 featureConfig）：
 *   - 用户消息 Markdown 渲染：开启后用户消息按 Markdown 渲染（标题、列表、
 *     代码块、@子代理 / @技能 引用）；关闭时与原生纯文本外观一致。
 *   - 浮动历史条：会话内容区边缘浮动历史记录条，悬停波浪高亮、点击跳转
 *     对应回合，支持「悬挂」（位置 / 数量在「界面增强」页签配置）。
 * 全部实现都在 client half（conversation.chat.node / details /
 * assistant-actions slot，随开关注册/注销）；host 无命令/服务——本模块只
 * 提供 feature 元数据、默认配置与空 register。
 */

export const key = "ui.enhance";
export const label = "界面增强";
export const description = "用户消息 Markdown 渲染 + 浮动历史条（位置/数量/悬挂在页签内配置），单一开关控制（融合自 dsh-client-ui-custom）";
export const defaultEnabled = false; // 默认关：不配置时与原生界面一致
export const kind = "feature"; // panel 默认 true：工具箱设置页生成「界面增强」页签

/** 方案A 配置默认值（历史条配置 + Markdown 独立开关）。 */
export const defaultConfig = {
	historyPosition: "off", // left / right / off
	historyLimit: 10, // 0 = 全部
	pinnedTurns: {}, // sessionId -> turn 数组（悬挂）
	markdownEnabled: true, // 界面增强开启时，用户消息 Markdown 渲染默认开启
};

export function register() {
	// client half 自包含；host 侧无事可做。
	return () => {};
}
