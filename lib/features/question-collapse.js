/**
 * Feature: question.collapse — 提问面板折叠（融合自
 * https://github.com/Townrain/dsh-question-panel-collapse，MIT，Copyright (c) 2026 Townrain）。
 *
 * 纯前端功能：agent 提问时（ask_user / plan 审批等）在提问面板 header 内
 * 加一个 chevron 按钮，点击把面板折叠成一条紧凑小条（草稿保留），再点展开。
 * 全部实现都在 client half（shell.overlay slot + DOM/CSS），host 无命令、
 * 无服务、无会话钩子——本模块只提供 feature 元数据与一个空 register，
 * 让框架的开关/热切换照常工作（reconcile 需要 register 返回 disposer）。
 */

export const key = "question.collapse";
export const label = "提问面板折叠";
export const description = "agent 提问时可将提问面板折叠为紧凑小条（回答草稿保留），再次点击展开";
export const defaultEnabled = true;
export const panel = false; // 无独立设置面板（纯交互增强）
export const kind = "feature";

export function register() {
	// client half 自包含；host 侧无事可做。
	return () => {};
}
