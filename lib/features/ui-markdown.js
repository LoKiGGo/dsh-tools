/**
 * Feature: ui.markdown — 用户消息 Markdown 渲染（融合自
 * https://github.com/yoli-mi/dsh-client-ui-custom，MIT，Copyright (c) 2026 Yoli-mi）。
 *
 * 开启后，你自己的消息按 Markdown 渲染（标题、列表、代码块、@子代理 /
 * @技能 引用等）；关闭时与原生纯文本外观完全一致。全部实现都在 client
 * half（keyed slot `conversation.chat.node` 以 priority -1 覆盖 user /
 * steering 单元格渲染，platform 原子组件来自 shell 静态表）。host 无
 * 命令/服务——本模块只提供 feature 元数据与空 register。
 */

export const key = "ui.markdown";
export const label = "Markdown 渲染";
export const description = "用户消息按 Markdown 渲染（标题/列表/代码块/@引用），默认关闭保持原生纯文本外观（融合自 dsh-client-ui-custom）";
export const defaultEnabled = false; // 默认关：不配置时与原生界面一致
export const panel = false; // 设置并入「界面增强」页签
export const kind = "feature";

export function register() {
	// client half 自包含；host 侧无事可做。
	return () => {};
}
