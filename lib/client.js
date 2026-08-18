/**
 * dsh-tools — browser half (classic client bundle).
 *
 * 注册两块 UI：
 *   - settings.section id `dsh-tools`：「dsh 工具箱」设置页 —— 全部功能
 *     开关 + 一键重启 dsh web + 已启用合并功能的操作面板（会话管理、
 *     插件开关、更新检查，均迁自旧本地插件）;
 *   - shell.overlay id `dsh-tools-notify`：右下角任务完成提示框，
 *     订阅宿主 SSE /dsh-tools/api/events。
 * 配置读写走宿主同源 JSON API /dsh-tools/api/{config,config/set,ping,restart}；
 * 合并功能面板走各自的 /dsh-tools/<feature>/api 前缀。
 */
window.__ModuleLoader__.load({
	id: "dsh-tools",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const React = require("react");
		const ReactDom = require("react-dom");
		// Platform atoms (shell static table): user-bubble chrome + markdown renderer.
		const UiPrimitives = require("@deepseek-ai/dsh-client-ui-primitives");
		const UiAttachment = require("@deepseek-ai/dsh-client-ui-attachment");
		// 引用解构（MessageText 等按需解构，保持可读）。
		const MarkdownText = UiPrimitives.MarkdownText;
		const JsonBlock = UiPrimitives.JsonBlock;
		const Tooltip = UiPrimitives.Tooltip;
		const IconCopyOutline16 = UiPrimitives.IconCopyOutline16;
		const IconCheckOutline16 = UiPrimitives.IconCheckOutline16;

		function el(type, props) {
			const children = [];
			for (let i = 2; i < arguments.length; i++) children.push(arguments[i]);
			return React.createElement.apply(null, [type, props].concat(children));
		}

		// --- package-owned stylesheets (idempotent against re-materialization) ---

		const STYLES = [
			{
				id: "dsh-tools-style",
				css: [
					'.dt-page { display:flex; flex-direction:column; gap:12px; width:100%; max-width:760px; color:var(--dsw-alias-label-primary); }',
					'.dt-bar { display:flex; align-items:baseline; justify-content:space-between; gap:8px; padding:0 2px; }',
					'.dt-heading { margin:0; font-size:13px; font-weight:600; line-height:20px; }',
					'.dt-hint, .dt-muted { margin:0; color:var(--dsw-alias-label-tertiary); font-size:12px; line-height:1.5; }',
					'.dt-notice { margin:0; border:1px solid var(--dsw-alias-border-l2); border-radius:8px; padding:8px 12px; font-size:12px; line-height:1.5; }',
					'.dt-tabs { display:flex; align-items:center; gap:6px; overflow-x:auto; scrollbar-width:none; -ms-overflow-style:none; padding:2px; cursor:grab; user-select:none; touch-action:pan-y; }',
					'.dt-tabs::-webkit-scrollbar { display:none; }',
					'.dt-tabs.dragging { cursor:grabbing; }',
					'.dt-tab { flex:none; padding:6px 12px; border-radius:6px; border:1px solid transparent; background:transparent; color:var(--dsw-alias-label-secondary); cursor:pointer; font:inherit; font-size:13px; white-space:nowrap; }',
					'.dt-tab:hover { color:var(--dsw-alias-label-primary); }',
					'.dt-tab:focus-visible { outline:2px solid var(--dsw-alias-state-business-primary); outline-offset:2px; }',
					'.dt-tab.active { border-color:var(--dsw-alias-border-l2); background:var(--dsw-alias-bg-layer-3); color:var(--dsw-alias-label-primary); font-weight:600; }',
					'.dt-tab-body { display:flex; flex-direction:column; gap:12px; }',
					'.dt-restart-card { display:flex; align-items:center; gap:10px; border:1px solid var(--dsw-alias-border-l2); background:var(--dsw-alias-bg-layer-3); border-radius:8px; padding:10px 14px; }',
					'.dt-notify-card { display:flex; align-items:center; gap:10px; border:1px solid var(--dsw-alias-border-l2); background:var(--dsw-alias-bg-layer-3); border-radius:8px; padding:10px 14px; }',
					'.dt-restart-info { flex:1; min-width:0; display:flex; flex-direction:column; gap:3px; }',
					'.dt-list { margin:0; padding:0; list-style:none; display:flex; flex-direction:column; gap:8px; }',
					'.dt-row { display:flex; align-items:center; gap:12px; border:1px solid var(--dsw-alias-border-l2); background:var(--dsw-alias-bg-layer-3); border-radius:10px; padding:10px 14px; }',
					'.dt-info { flex:1; min-width:0; display:flex; flex-direction:column; gap:3px; }',
					'.dt-name { font-weight:600; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }',
					'.dt-meta { color:var(--dsw-alias-label-tertiary); font-size:12px; line-height:1.5; }',
					'.dt-badge { margin-left:8px; padding:0 6px; border-radius:6px; font-size:11px; font-weight:400; color:var(--dsw-alias-label-secondary); background:var(--dsw-alias-bg-module-platform); vertical-align:1px; }',
					'.dt-switch { display:inline-flex; align-items:center; gap:8px; border:none; background:transparent; color:var(--dsw-alias-label-secondary); cursor:pointer; font:inherit; font-size:12px; padding:2px; border-radius:6px; flex:none; }',
					'.dt-switch:focus-visible { outline:2px solid var(--dsw-alias-state-business-primary); outline-offset:2px; }',
					'.dt-switch:disabled { cursor: default; }',
					'.dt-track { position:relative; width:32px; height:18px; border-radius:999px; background:var(--dsw-alias-bg-module-platform); border:1px solid var(--dsw-alias-border-l2); transition:background .16s,border-color .16s; flex:none; }',
					'.dt-thumb { position:absolute; top:1px; left:1px; width:14px; height:14px; border-radius:50%; background:var(--dsw-alias-label-secondary); transition:transform .16s, background .16s; }',
					'.dt-switch.on .dt-track { background:var(--dsw-alias-state-success-primary); border-color:transparent; }',
					'.dt-switch.on .dt-thumb { transform:translateX(14px); background:#fff; }',
					'.dt-label { white-space:nowrap; }',
					'.dt-btn { border:1px solid var(--dsw-alias-border-l2); color:var(--dsw-alias-label-primary); background:var(--dsw-alias-bg-layer-3); font:inherit; font-size:12px; cursor:pointer; border-radius:6px; padding:4px 12px; flex:none; }',
					'.dt-btn:hover:not(:disabled) { border-color:var(--dsw-alias-label-dimmed); }',
					'.dt-btn:disabled { opacity:.5; cursor:default; }',
					'.dt-btn.primary { color:#fff; background:var(--dsw-alias-state-business-primary); border-color:transparent; }',
					'.dt-panel { border:1px solid var(--dsw-alias-border-l2); background:var(--dsw-alias-bg-layer-3); border-radius:10px; padding:12px 14px; display:flex; flex-direction:column; gap:8px; }',
					'.dt-panel-head { margin:0; font-size:13px; font-weight:600; line-height:20px; }',
					'.dt-toast-stack { position:fixed; right:16px; bottom:16px; z-index:1000; display:flex; flex-direction:column; gap:10px; width:320px; max-width:calc(100vw - 32px); pointer-events:auto; }',
					'.dt-toast { pointer-events:auto; display:flex; align-items:flex-start; gap:10px; padding:12px 14px; border:1px solid var(--dsw-alias-border-l2); border-radius:12px; background:var(--dsw-alias-bg-layer-3); box-shadow:0 8px 24px rgba(0,0,0,.18); cursor:pointer; color:var(--dsw-alias-label-primary); font-size:13px; line-height:1.5; }',
					'.dt-toast:hover { border-color:var(--dsw-alias-label-dimmed); }',
					'.dt-toast:focus-visible { outline:2px solid var(--dsw-alias-state-business-primary); outline-offset:2px; }',
					'.dt-toast-body { flex:1; min-width:0; display:flex; flex-direction:column; gap:2px; }',
					'.dt-toast-title { font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }',
					'.dt-toast-sub { color:var(--dsw-alias-label-tertiary); font-size:12px; }',
					'.dt-toast-close { flex:none; border:none; background:transparent; color:var(--dsw-alias-label-tertiary); cursor:pointer; font-size:16px; line-height:1; padding:2px 4px; border-radius:6px; }',
					'.dt-toast-close:hover { color:var(--dsw-alias-label-primary); background:var(--dsw-alias-bg-module-platform); }',
				].join("\n"),
			},
			{
				id: "dsh-delete-chat-style",
				css: [
					'.dsh-delchat { display:flex; flex-direction:column; gap:10px; padding:2px 0 10px; font-size:13px; }',
					'.dsh-delchat-tabs { display:flex; gap:6px; border-bottom:1px solid rgba(128,128,128,.28); padding-bottom:8px; }',
					'.dsh-delchat-tab { padding:6px 12px; border-radius:6px; border:1px solid transparent; cursor:pointer; background:transparent; color:inherit; font-size:13px; }',
					'.dsh-delchat-tab.active { border-color:rgba(128,128,128,.45); background:rgba(128,128,128,.14); }',
					'.dsh-delchat-bar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }',
					'.dsh-delchat-row { display:flex; align-items:center; gap:8px; padding:6px 8px; border-radius:6px; }',
					'.dsh-delchat-row:hover { background:rgba(128,128,128,.08); }',
					'.dsh-delchat-title { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }',
					'.dsh-delchat-badge { font-size:11px; padding:1px 6px; border-radius:8px; border:1px solid rgba(128,128,128,.4); opacity:.85; white-space:nowrap; }',
					'.dsh-delchat-badge.live { border-color:rgba(120,180,120,.55); }',
					'.dsh-delchat-btn { padding:4px 10px; border-radius:6px; border:1px solid rgba(128,128,128,.45); background:transparent; color:inherit; cursor:pointer; font-size:12px; white-space:nowrap; }',
					'.dsh-delchat-btn:hover { background:rgba(128,128,128,.14); }',
					'.dsh-delchat-btn:disabled { opacity:.45; cursor:default; }',
					'.dsh-delchat-btn.danger { border-color:rgba(225,90,90,.6); color:rgb(235,110,110); }',
					'.dsh-delchat-muted { opacity:.65; font-size:12px; }',
					'.dsh-delchat-confirm { border:1px solid rgba(225,90,90,.55); background:rgba(225,90,90,.08); border-radius:8px; padding:10px 12px; display:flex; flex-direction:column; gap:8px; }',
					'.dsh-delchat-notice { border:1px solid rgba(128,128,128,.4); border-radius:8px; padding:8px 12px; font-size:12px; }',
					'.dsh-delchat-group { display:flex; flex-direction:column; border:1px solid rgba(128,128,128,.28); border-radius:8px; overflow:hidden; }',
					'.dsh-delchat-tab-body { display:flex; flex-direction:column; gap:12px; }',
					'.dsh-delchat-group-head { display:flex; align-items:center; gap:8px; padding:8px 10px; background:rgba(128,128,128,.06); }',
					'.dsh-delchat-arrow { flex:none; width:20px; height:20px; border:none; background:transparent; color:inherit; cursor:pointer; font-size:11px; line-height:1; padding:0; border-radius:4px; }',
					'.dsh-delchat-arrow:hover { background:rgba(128,128,128,.14); }',
					'.dsh-delchat-group-title { flex:0 1 auto; min-width:0; max-width:45%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; border:none; background:transparent; color:inherit; cursor:pointer; font:inherit; font-weight:600; text-align:left; padding:2px 4px; border-radius:4px; }',
					'.dsh-delchat-group-title:hover { background:rgba(128,128,128,.14); }',
					'.dsh-delchat-group-path { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }',
					'.dsh-delchat-path-btn { background:none; border:none; padding:0; font:inherit; color:inherit; cursor:pointer; text-align:left; text-decoration:none; }',
					'.dsh-delchat-path-btn:hover { text-decoration:underline; }',
					'.dsh-delchat-path-btn:disabled { cursor:default; opacity:.6; }',
					'.dsh-delchat-group-count { flex:none; white-space:nowrap; }',
					'.dsh-delchat-group-body { display:flex; flex-direction:column; gap:2px; padding:6px; border-top:1px solid rgba(128,128,128,.16); }',
				].join("\n"),
			},
			{
				id: "dsh-plugin-toggle-style",
				css: [
					'.pt { display:flex; flex-direction:column; gap:12px; width:100%; max-width:760px; color:var(--dsw-alias-label-primary); }',
					'.pt-bar { display:flex; align-items:baseline; justify-content:space-between; gap:8px; padding:0 2px; }',
					'.pt-heading { margin:0; font-size:13px; font-weight:600; line-height:20px; }',
					'.pt-heading span { color:var(--dsw-alias-label-tertiary); font-variant-numeric:tabular-nums; font-size:12px; font-weight:400; }',
					'.pt-hint, .pt-muted { margin:0; color:var(--dsw-alias-label-tertiary); font-size:12px; line-height:1.5; }',
					'.pt-error { color:var(--dsw-alias-state-error-primary); font-size:12px; line-height:1.5; }',
					'.pt-notice { margin:0; border:1px solid var(--dsw-alias-border-l2); border-radius:8px; padding:8px 12px; font-size:12px; line-height:1.5; }',
					'.pt-restart { display:flex; align-items:center; gap:10px; border:1px solid var(--dsw-alias-border-l2); background:var(--dsw-alias-bg-layer-3); border-radius:8px; padding:8px 12px; font-size:12px; }',
					'.pt-restart span { flex:1; min-width:0; }',
					'.pt-list { margin:0; padding:0; list-style:none; display:flex; flex-direction:column; gap:8px; }',
					'.pt-row { display:flex; align-items:center; gap:12px; border:1px solid var(--dsw-alias-border-l2); background:var(--dsw-alias-bg-layer-3); border-radius:10px; padding:10px 14px; }',
					'.pt-info { flex:1; min-width:0; display:flex; flex-direction:column; gap:3px; }',
					'.pt-name { font-weight:600; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }',
					'.pt-meta { color:var(--dsw-alias-label-tertiary); font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }',
					'.pt-switch { display:inline-flex; align-items:center; gap:8px; border:none; background:transparent; color:var(--dsw-alias-label-secondary); cursor:pointer; font:inherit; font-size:12px; padding:2px; border-radius:6px; flex:none; }',
					'.pt-switch:focus-visible { outline:2px solid var(--dsw-alias-state-business-primary); outline-offset:2px; }',
					'.pt-switch:disabled { cursor:default; }',
					'.pt-track { position:relative; width:32px; height:18px; border-radius:999px; background:var(--dsw-alias-bg-module-platform); border:1px solid var(--dsw-alias-border-l2); transition:background .16s,border-color .16s; flex:none; }',
					'.pt-thumb { position:absolute; top:1px; left:1px; width:14px; height:14px; border-radius:50%; background:var(--dsw-alias-label-secondary); transition:transform .16s, background .16s; }',
					'.pt-switch.on .pt-track { background:var(--dsw-alias-state-success-primary); border-color:transparent; }',
					'.pt-switch.on .pt-thumb { transform:translateX(14px); background:#fff; }',
					'.pt-label { white-space:nowrap; }',
					'.pt-btn { border:1px solid var(--dsw-alias-border-l2); color:var(--dsw-alias-label-primary); background:var(--dsw-alias-bg-layer-3); font:inherit; font-size:12px; cursor:pointer; border-radius:6px; padding:4px 12px; flex:none; }',
					'.pt-btn:hover:not(:disabled) { border-color:var(--dsw-alias-label-dimmed); }',
					'.pt-btn:disabled { opacity:.5; cursor:default; }',
					'.pt-btn.primary { color:#fff; background:var(--dsw-alias-state-business-primary); border-color:transparent; }',
					'.pt-name-link { color:inherit; text-decoration:none; cursor:pointer; }',
					'.pt-name-link:hover { text-decoration:underline; }',
					'.pt-desc-toggle { background:none; border:none; padding:0; font:inherit; color:var(--dsw-alias-label-tertiary); font-size:12px; cursor:pointer; text-align:left; align-self:flex-start; }',
					'.pt-desc-toggle:hover { color:var(--dsw-alias-label-primary); text-decoration:underline; }',
					'.pt-desc { color:var(--dsw-alias-label-tertiary); font-size:12px; line-height:1.5; }',
					'.pt-desc-line + .pt-desc-line { margin-top:4px; }',
				].join("\n"),
			},
			{
				id: "dsh-update-plugin-style",
				css: [
					'.dsh-upd { display:flex; flex-direction:column; gap:12px; padding:2px 0 10px; font-size:13px; color:var(--dsw-alias-label-primary); }',
					'.dsh-upd-bar { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }',
					'.dsh-upd-btn { padding:5px 14px; border-radius:6px; border:1px solid var(--dsw-alias-border-l2); background:transparent; color:inherit; cursor:pointer; font-size:13px; white-space:nowrap; }',
					'.dsh-upd-btn:hover { background:var(--dsw-alias-bg-layer-1); }',
					'.dsh-upd-btn:disabled { opacity:.45; cursor:default; }',
					'.dsh-upd-btn.primary { border-color:var(--dsw-alias-state-business-primary); color:var(--dsw-alias-state-business-primary); }',
					'.dsh-upd-btn.danger { border-color:rgba(225,90,90,.6); color:rgb(235,110,110); }',
					'.dsh-upd-status { color:var(--dsw-alias-label-tertiary); font-size:12px; }',
					'.dsh-upd-status.error { color:var(--dsw-alias-state-error-primary); }',
					'.dsh-upd-notice { border:1px solid rgba(128,128,128,.4); background:var(--dsw-alias-bg-layer-1); border-radius:8px; padding:8px 12px; font-size:12px; color:var(--dsw-alias-label-tertiary); }',
					'.dsh-upd-section { display:flex; flex-direction:column; gap:8px; }',
					'.dsh-upd-heading { margin:0; font-size:13px; font-weight:600; color:var(--dsw-alias-label-primary); }',
					'.dsh-upd-heading span { color:var(--dsw-alias-label-tertiary); font-weight:400; font-variant-numeric:tabular-nums; }',
					'.dsh-upd-row { display:flex; align-items:center; gap:10px; padding:8px 10px; border:1px solid var(--dsw-alias-border-l2); background:var(--dsw-alias-bg-layer-3); border-radius:8px; flex-wrap:wrap; }',
					'.dsh-upd-name { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:500; }',
					'.dsh-upd-ver { font-variant-numeric:tabular-nums; color:var(--dsw-alias-label-tertiary); font-size:12px; white-space:nowrap; }',
					'.dsh-upd-ver.latest { color:rgb(120,180,120); }',
					'.dsh-upd-arrow { color:var(--dsw-alias-label-tertiary); }',
					'.dsh-upd-skip { color:var(--dsw-alias-label-tertiary); font-size:12px; }',
					'.dsh-upd-skip-body { flex:1; min-width:0; display:flex; flex-direction:column; gap:2px; }',
					'.dsh-upd-skip-name { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }',
					'.dsh-upd-skip-line { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }',
					'.dsh-upd-row-error { color:var(--dsw-alias-state-error-primary); font-size:12px; }',
					'.dsh-upd-muted { color:var(--dsw-alias-label-tertiary); font-size:12px; }',
					'.dsh-upd-name-link { color:inherit; text-decoration:none; cursor:pointer; }',
					'.dsh-upd-name-link:hover { text-decoration:underline; }',
				].join("\n"),
			},
			{
				id: "dsh-plugin-catalog-style",
				css: [
					'.pc { display:flex; flex-direction:column; gap:12px; width:100%; max-width:760px; color:var(--dsw-alias-label-primary); }',
					'.pc-bar { display:flex; align-items:baseline; justify-content:space-between; gap:8px; padding:0 2px; }',
					'.pc-heading { margin:0; font-size:13px; font-weight:600; line-height:20px; }',
					'.pc-heading span { color:var(--dsw-alias-label-tertiary); font-variant-numeric:tabular-nums; font-size:12px; font-weight:400; }',
					'.pc-hint, .pc-muted { margin:0; color:var(--dsw-alias-label-tertiary); font-size:12px; line-height:1.5; }',
					'.pc-status { margin:0; color:var(--dsw-alias-label-tertiary); font-size:13px; line-height:20px; }',
					'.pc-error { margin:0; color:var(--dsw-alias-state-error-primary); font-size:13px; line-height:20px; display:flex; align-items:center; gap:10px; }',
					'.pc-error button { border:1px solid var(--dsw-alias-border-l2); color:var(--dsw-alias-label-primary); font:inherit; cursor:pointer; background:transparent; border-radius:6px; padding:4px 10px; }',
					'.pc-search { position:relative; display:flex; align-items:center; }',
					'.pc-search input { width:100%; height:36px; border:1px solid var(--dsw-alias-border-l2); background:var(--dsw-alias-bg-layer-1); color:var(--dsw-alias-label-primary); font:inherit; font-size:13px; border-radius:8px; outline:none; padding:0 12px; }',
					'.pc-search input::placeholder { color:var(--dsw-alias-label-tertiary); }',
					'.pc-search input:focus-visible { border-color:var(--dsw-alias-state-business-primary); box-shadow:0 0 0 2px color-mix(in srgb, var(--dsw-alias-state-business-primary) 18%, transparent); }',
					'.pc-chips { display:flex; flex-wrap:wrap; gap:8px; padding:2px 0; }',
					'.pc-chip { padding:5px 12px; border-radius:999px; border:1px solid var(--dsw-alias-border-l2); background:transparent; color:var(--dsw-alias-label-secondary); font:inherit; font-size:12px; cursor:pointer; white-space:nowrap; }',
					'.pc-chip:hover { color:var(--dsw-alias-label-primary); }',
					'.pc-chip:focus-visible { outline:2px solid var(--dsw-alias-state-business-primary); outline-offset:2px; }',
					'.pc-chip.on { border-color:var(--dsw-alias-state-business-primary); color:var(--dsw-alias-state-business-primary); font-weight:600; }',
					'.pc-cards { margin:0; padding:0; list-style:none; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; align-items:start; }',
					'.pc-card { border:1px solid var(--dsw-alias-border-l2); background:var(--dsw-alias-bg-layer-3); border-radius:10px; min-width:0; overflow:hidden; }',
					'.pc-card[data-open=true] { border-color:var(--dsw-alias-border-l1); }',
					'.pc-card-head { appearance:none; width:100%; display:flex; align-items:center; gap:10px; padding:12px 14px; border:0; background:transparent; color:inherit; font:inherit; text-align:left; cursor:pointer; }',
					'.pc-card-head:focus-visible { outline:2px solid var(--dsw-alias-state-business-primary); outline-offset:-2px; }',
					'.pc-card-title { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:600; font-size:13px; }',
					'.pc-badge { flex:none; padding:1px 8px; border-radius:999px; font-size:11px; line-height:17px; white-space:nowrap; }',
					'.pc-badge.official { color:var(--dsw-alias-state-business-primary); background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 12%, transparent); }',
					'.pc-badge.installed { color:var(--dsw-alias-state-success-primary); background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 12%, transparent); }',
					'.pc-badge.local { color:var(--dsw-alias-state-warn-primary); background:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 12%, transparent); }',
					'.pc-trailing { flex:none; display:flex; align-items:center; gap:8px; }',
					'.pc-dot { width:8px; height:8px; border-radius:50%; background:var(--dsw-alias-label-tertiary); }',
					'.pc-dot[data-phase=active] { background:var(--dsw-alias-state-success-primary); }',
					'.pc-dot[data-phase=failed] { background:var(--dsw-alias-state-error-primary); }',
					'.pc-dot[data-phase=loading], .pc-dot[data-phase=pending], .pc-dot[data-phase=unloading] { background:var(--dsw-alias-state-warn-primary); }',
					'.pc-tag { flex:none; padding:1px 8px; border-radius:999px; font-size:11px; line-height:17px; white-space:nowrap; color:var(--dsw-alias-label-secondary); background:var(--dsw-alias-bg-module-platform); }',
					'.pc-details { border-top:1px solid var(--dsw-alias-border-l2); margin:0 14px; padding:10px 0 12px; }',
					'.pc-details code { display:block; margin-bottom:8px; font-family:ui-monospace,Consolas,monospace; font-size:12px; color:var(--dsw-alias-label-secondary); overflow-wrap:anywhere; }',
					'.pc-details dl { margin:0; display:flex; flex-direction:column; gap:6px; }',
					'.pc-details dl > div { display:flex; gap:8px; }',
					'.pc-details dt { flex:none; width:64px; color:var(--dsw-alias-label-tertiary); font-size:12px; }',
					'.pc-details dd { margin:0; min-width:0; color:var(--dsw-alias-label-primary); font-size:12px; overflow-wrap:anywhere; }',
					'.pc-empty { margin:0; color:var(--dsw-alias-label-tertiary); font-size:13px; line-height:20px; }',
				].join("\n"),
			},

			{
				// 用户消息 Markdown 渲染（融合自 dsh-client-ui-custom，MIT © Yoli-mi）。
				// 类名全部加 dt-md- 前缀，避免全局样式污染。
				id: "dsh-tools-ui-markdown-style",
				css: [
					'.dt-md-userRow { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }',
					'.dt-md-userStack { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; min-width: 0; max-width: min(525px, 82%); }',
					'.dt-md-bubble { max-width: 100%; background: var(--dsw-specific-bubble-user, var(--dsw-specific-bubble)); border-radius: 22px; box-shadow: 0 2px 10px rgb(15 17 21 / 0.06); padding: 10px 16px; font-size: 16px; line-height: 24px; color: var(--dsw-alias-label-primary); }',
					'.dt-md-refChip { display: inline-block; margin: 0 2px; padding: 0 8px; border-radius: 6px; background: rgba(97,135,216,.22); color: var(--dsw-alias-label-primary); font-size: .85em; line-height: 1.6; white-space: nowrap; vertical-align: baseline; }',
					'.dt-md-actions { display: flex; align-items: center; gap: 10px; height: 28px; }',
					'.dt-md-timeStart { padding-right: 12px; font-size: 14px; line-height: 24px; color: var(--dsw-alias-label-tertiary); white-space: nowrap; }',
					'@media (hover: hover) { [data-time-hover-root] .dt-md-timeStart { opacity: 0; transition: opacity 80ms ease; } [data-time-hover-root]:hover .dt-md-timeStart, [data-time-hover-root]:focus-within .dt-md-timeStart { opacity: 1; } }',
					'.dt-md-action { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 6px; border: none; border-radius: 28px; background: transparent; color: var(--dsw-alias-label-tertiary); cursor: pointer; }',
					'.dt-md-action:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }',
				].join("\n"),
			},
			{
				// 浮动历史条 + 悬挂（融合自 dsh-client-ui-custom，MIT © Yoli-mi）。
				// 类名加 dt-hs- / dt-pin- 前缀，避免全局样式污染。
				id: "dsh-tools-ui-history-style",
				css: [
					'.dt-hs-strip { position: fixed; top: 50%; translate: 0 -50%; z-index: 50; display: flex; flex-direction: column; gap: 5px; padding: 8px 2px; pointer-events: auto; background: transparent; border: none; box-shadow: none; }',
					'.dt-hs-stripRight { right: 12px; align-items: flex-end; }',
					'.dt-hs-stripLeft { left: 12px; align-items: flex-start; }',
					'.dt-hs-bar { flex: none; height: 5px; border: none; border-radius: 3px; background: var(--dsw-alias-border-l2); cursor: pointer; transition: width 200ms cubic-bezier(.2,.7,.3,1.1), background 200ms ease; }',
					'.dt-hs-bar:hover, .dt-hs-bar:focus-visible { outline: none; }',
					'.dt-hs-barPinned { background: color-mix(in srgb, var(--dsu-accent, var(--dsw-alias-brand-primary)) 25%, transparent); box-shadow: inset 0 0 0 1.5px var(--dsu-accent, var(--dsw-alias-brand-primary)); }',
					'.dt-hs-barActive { background: color-mix(in srgb, var(--dsu-accent, var(--dsw-alias-brand-primary)) 55%, transparent); }',
					'.dt-hs-barPeak { background: var(--dsu-accent, var(--dsw-alias-brand-primary)); }',
					'.dt-hs-barNear { background: color-mix(in srgb, var(--dsu-accent, var(--dsw-alias-brand-primary)) 50%, transparent); }',
					'.dt-hs-barFar { background: color-mix(in srgb, var(--dsu-accent, var(--dsw-alias-brand-primary)) 28%, transparent); }',
					'.dt-hs-tooltip { position: fixed; right: 64px; transform: translateY(-50%); z-index: 60; display: flex; align-items: center; gap: 7px; width: 220px; padding: 7px 11px; border-radius: 8px; background: color-mix(in srgb, var(--dsu-accent, var(--dsw-alias-brand-primary)) 6%, var(--dsw-alias-bg-overlay)); border: 1px solid var(--dsw-alias-border-l2); box-shadow: 0 4px 16px rgb(0 0 0 / .25); pointer-events: none; animation: dtHstooltipInRight 160ms ease; }',
					'.dt-hs-tooltipLeft { right: auto; animation: dtHstooltipInLeft 160ms ease; }',
					'@keyframes dtHstooltipInRight { from { opacity: 0; transform: translateY(-50%) translateX(4px); } to { opacity: 1; transform: translateY(-50%) translateX(0); } }',
					'@keyframes dtHstooltipInLeft { from { opacity: 0; transform: translateY(-50%) translateX(-4px); } to { opacity: 1; transform: translateY(-50%) translateX(0); } }',
					'.dt-hs-tooltipDot { flex: none; width: 6px; height: 6px; border-radius: 50%; background: var(--dsu-accent, var(--dsw-alias-brand-primary)); }',
					'.dt-hs-tooltipText { flex: 1; min-width: 0; font-size: 12px; line-height: 17px; color: var(--dsw-alias-label-primary); overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }',
					'.dt-pin-action { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 6px; border: none; border-radius: 28px; background: transparent; color: var(--dsw-alias-label-tertiary); cursor: pointer; }',
					'.dt-pin-action:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }',
					'.dt-pin-action[data-active=true] { color: var(--dsu-accent, var(--dsw-alias-brand-primary)); }',
				].join("\n"),
			},
			{
				// 应用用量面板（融合自 dsh-client-ui-custom，MIT © Yoli-mi）。
				// 类名加 dt-ug- 前缀，避免全局样式污染。
				id: "dsh-tools-ui-usage-style",
				css: [
					'.dt-ug-section { display: flex; flex-direction: column; gap: 14px; }',
					'.dt-ug-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 10px; }',
					'.dt-ug-tabs { display: inline-flex; gap: 6px; padding: 3px; border-radius: 10px; background: color-mix(in srgb, var(--dsw-alias-bg-base) 70%, transparent); border: 1px solid var(--dsw-alias-border-l2); width: fit-content; }',
					'.dt-ug-tab { height: 26px; padding: 0 12px; border: none; border-radius: 7px; background: none; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 26px; cursor: pointer; }',
					'.dt-ug-tabActive { background: var(--dsw-alias-brand-primary); color: var(--dsw-alias-label-primary-foreground); }',
					'.dt-ug-model { display: inline-flex; align-items: center; justify-content: space-between; gap: 8px; height: 26px; padding: 0 10px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 7px; background: color-mix(in srgb, var(--dsw-alias-bg-base) 70%, transparent); color: var(--dsw-alias-label-secondary); font-size: 12px; cursor: pointer; }',
					'.dt-ug-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; }',
					'.dt-ug-kpi { display: flex; flex-direction: column; gap: 4px; padding: 12px 14px; border-radius: 12px; border: 1px solid var(--dsw-alias-border-l2); background: color-mix(in srgb, var(--dsw-alias-bg-base) 78%, transparent); }',
					'.dt-ug-kpiLabel { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary); }',
					'.dt-ug-kpiValue { font-size: 18px; line-height: 24px; font-weight: 600; color: var(--dsw-alias-label-primary); }',
					'.dt-ug-kpiSub { font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-tertiary); }',
					'.dt-ug-breakdown { display: flex; flex-direction: column; gap: 8px; }',
					'.dt-ug-breakdownLabel { font-size: 13px; line-height: 20px; font-weight: 500; color: var(--dsw-alias-label-primary); }',
					'.dt-ug-bars { display: flex; align-items: flex-end; gap: 6px; height: 90px; padding: 10px; border-radius: 12px; border: 1px solid var(--dsw-alias-border-l2); background: color-mix(in srgb, var(--dsw-alias-bg-base) 78%, transparent); }',
					'.dt-ug-barWrap { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 4px; height: 100%; justify-content: flex-end; }',
					'.dt-ug-bar { width: 70%; min-height: 2px; border-radius: 4px 4px 2px 2px; background: linear-gradient(180deg, var(--dsw-alias-brand-primary), color-mix(in srgb, var(--dsw-alias-brand-primary) 55%, white)); opacity: .9; }',
					'.dt-ug-barLabel { font-size: 10px; line-height: 12px; color: var(--dsw-alias-label-tertiary); white-space: nowrap; overflow: hidden; max-width: 100%; text-overflow: ellipsis; }',
					'.dt-ug-top { display: flex; flex-direction: column; gap: 6px; }',
					'.dt-ug-topRow { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 10px; border: 1px solid var(--dsw-alias-border-l1); background: color-mix(in srgb, var(--dsw-alias-bg-base) 70%, transparent); font-size: 13px; line-height: 20px; }',
					'.dt-ug-topRank { flex: none; width: 20px; text-align: center; color: var(--dsw-alias-label-tertiary); font-size: 12px; }',
					'.dt-ug-topTitle { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-primary); }',
					'.dt-ug-topTokens { flex: none; font-weight: 600; color: var(--dsw-alias-label-primary); }',
					'.dt-ug-empty { padding: 16px 0; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-tertiary); }',
					'.dt-ug-chevron { flex: none; color: var(--dsw-alias-label-tertiary); }',
				].join("\n"),
			},
			{
				// 「界面增强」页签样式（历史条配置 + Markdown 渲染说明）。
				id: "dsh-tools-ui-enhance-style",
				css: [
					'.dt-enh-row { display: flex; align-items: flex-start; gap: 10px; padding: 6px 0; }',
					'.dt-enh-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }',
					'.dt-enh-field { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 4px 0; }',
					'.dt-enh-label { flex: none; min-width: 84px; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary); }',
					'.dt-enh-input { width: 96px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; border-radius: 6px; padding: 4px 8px; }',
					'.dt-enh-input:focus { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 1px; }',
				].join("\n"),
			},
			{
				// 「微信接入」页签样式。
				id: "dsh-tools-wechat-style",
				css: [
					'.dt-wx-body { display:flex; flex-direction:column; gap:8px; }',
					'.dt-wx-row { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }',
					'.dt-wx-label { flex:none; min-width:84px; font-size:13px; line-height:20px; color:var(--dsw-alias-label-secondary); }',
					'.dt-wx-text { flex:1 1 auto; min-width:0; font-size:13px; line-height:20px; color:var(--dsw-alias-label-primary); }',
					'.dt-wx-muted { font-size:12px; line-height:18px; color:var(--dsw-alias-label-tertiary); }',
					'.dt-wx-qr { max-width:220px; max-height:220px; border:1px solid var(--dsw-alias-border-l2); border-radius:8px; padding:8px; background:#fff; }',
					'.dt-wx-input { width:180px; border:1px solid var(--dsw-alias-border-l2); background:var(--dsw-alias-bg-layer-3); color:var(--dsw-alias-label-primary); font:inherit; font-size:12px; border-radius:6px; padding:4px 8px; }',
					'.dt-wx-textarea { width:100%; min-height:64px; box-sizing:border-box; border:1px solid var(--dsw-alias-border-l2); background:var(--dsw-alias-bg-layer-3); color:var(--dsw-alias-label-primary); font:inherit; font-size:12px; border-radius:6px; padding:6px 8px; resize:vertical; }',
					'.dt-wx-select { border:1px solid var(--dsw-alias-border-l2); background:var(--dsw-alias-bg-layer-3); color:var(--dsw-alias-label-primary); font:inherit; font-size:12px; border-radius:6px; padding:4px 8px; }',
					'.dt-wx-btn-danger, .dt-wx-btn-success { padding:4px 12px !important; font-size:12px !important; line-height:normal !important; border-radius:6px !important; border:1px solid !important; min-height:0 !important; height:auto !important; flex:none !important; }',
					'.dt-wx-btn-danger { background:#e5484d !important; border-color:#e5484d !important; color:#fff !important; }',
					'.dt-wx-btn-success { background:#16a34a !important; border-color:#16a34a !important; color:#fff !important; }',
					'.dt-wx-details { border:1px solid var(--dsw-alias-border-l2); border-radius:8px; padding:8px 10px; background:var(--dsw-alias-bg-layer-3); }',
					'.dt-wx-summary { cursor:pointer; font-size:13px; line-height:20px; color:var(--dsw-alias-label-primary); user-select:none; }',
					'.dt-wx-summary::-webkit-details-marker { color:var(--dsw-alias-label-tertiary); }',
					'.dt-wx-pre { margin:6px 0 0; padding:8px 10px; border:1px solid var(--dsw-alias-border-l1); border-radius:6px; background:var(--dsw-alias-bg-base); font:12px/1.6 monospace; color:var(--dsw-alias-label-secondary); white-space:pre-wrap; word-break:break-all; }',
				].join("\n"),
			},
		];
		for (const entry of STYLES) {
			let tag = document.getElementById(entry.id);
			if (tag === null) {
				tag = document.createElement("style");
				tag.id = entry.id;
				document.head.append(tag);
			}
			tag.textContent = entry.css;
		}

		// --- Host-half JSON API factory (same-origin fetch) ---

		function makeApi(base) {
			return async function api(method, payload) {
				let response;
				try {
					response = await fetch(base + "/" + method, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify(payload === undefined ? {} : payload),
					});
				} catch (error) {
					throw new Error("无法连接 dsh-tools 服务（" + base + "）：" + String((error && error.message) || error));
				}
				let body;
				try {
					body = await response.json();
				} catch {
					body = { ok: false, error: { message: "服务返回了无法解析的结果" } };
				}
				if (body === null || typeof body !== "object" || body.ok !== true) {
					const err = body && body.error;
					throw new Error(err && err.message ? String(err.message) : String((err && err.code) || "服务请求失败"));
				}
				return body.value;
			};
		}

		const api = makeApi("/dsh-tools/api");
		const apiDelete = makeApi("/dsh-tools/delete-chat/api");
		const apiToggle = makeApi("/dsh-tools/plugin-toggle/api");
		const apiUpdate = makeApi("/dsh-tools/update-plugin/api");
		const apiWechat = makeApi("/dsh-tools/wechat.openclaw/api");

		// --- shared config store (settings page writes, overlay reads) ---

		let configStore = null;
		const configListeners = new Set();

		function setConfig(next) {
			configStore = next;
			for (const listener of configListeners) listener();
		}

		function refreshConfig() {
			api("config").then(setConfig, (error) => {
				console.error("dsh-tools: load config failed:", error);
			});
		}

		function useConfig() {
			const [cfg, setCfg] = React.useState(configStore);
			React.useEffect(() => {
				const listener = () => setCfg(configStore);
				configListeners.add(listener);
				if (configStore === null) refreshConfig();
				return () => configListeners.delete(listener);
			}, []);
			return cfg;
		}

		/** Optimistic default (true) until the config snapshot arrives. */
		function featureEnabled(cfg, key) {
			if (cfg === null) return true;
			const entry = (cfg.features || []).find((f) => f.key === key);
			return entry === undefined ? true : entry.enabled === true;
		}

		/** Per-feature config (方案A), optimistic default {} until the snapshot arrives. */
		function featureConfigOf(cfg, key) {
			if (cfg === null || cfg.featureConfig === undefined || cfg.featureConfig === null) return {};
			const value = cfg.featureConfig[key];
			return value !== undefined && value !== null && typeof value === "object" ? value : {};
		}

		/** Persist one feature's config via the framework route, then refresh the store. */
		function setFeatureConfig(key, nextConfig) {
			return api("config/feature", { key, config: nextConfig }).then(setConfig, (error) => {
				throw new Error("保存配置失败：" + String((error && error.message) || error));
			});
		}

		function formatTime(ms) {
			if (typeof ms !== "number" || !Number.isFinite(ms)) return "";
			const d = new Date(ms);
			const pad = (n) => String(n).padStart(2, "0");
			return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
		}

		/** Human-readable byte size: B / KB / MB / GB / TB. null/undefined → "未知". */
		function formatBytes(bytes) {
			if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) return "未知";
			if (bytes < 1024) return bytes + " B";
			const units = ["KB", "MB", "GB", "TB"];
			let value = bytes;
			let unit = "B";
			for (const u of units) {
				value /= 1024;
				unit = u;
				if (value < 1024) break;
			}
			const text = value >= 100 ? String(Math.round(value)) : value.toFixed(1);
			return text + " " + unit;
		}

		// --- merged panel: 会话管理 (from dsh-delete-chat) ---

		function deleteChatErrorText(res) {
			if (res === undefined || res === null) return "无响应";
			if (res.ok) return null;
			switch (res.error) {
				case "not-found": return "会话不存在或已被删除";
				case "live-requires-confirm": return "需要确认删除活跃会话";
				case "delete-unavailable": return "当前后端不支持物理删除";
				case "unsupported-backend": return "不支持的后端类型: " + String(res.kind);
				case "bad-location": return "无法解析日志位置";
				case "rm-failed": return "删除命令失败 (exit " + String(res.exitCode) + ")";
				case "bad-request": return "请求参数无效";
				case "services-unavailable": return "所需宿主服务不可用";
				default: return "未知错误: " + String(res.error);
			}
		}

		// 会话列表加载的模块级状态：页面加载（=dsh web 启动后）时重置，
		// 因此每次 dsh web 启动后只有「首次打开会话管理面板」会自动加载列表；
		// 之后打开直接恢复上次结果，用户手动点「刷新」才再次拉取（查看归档更新）。
		const deleteChatStore = { autoLoaded: false, inFlight: false, promise: null, data: null };

		/**
		 * Pure load decision for the 会话管理 panel (exposed via
		 * __dshToolsTest so the Node smoke test can assert it without a DOM).
		 * @returns "load" (first open after page load — fetch the list),
		 * "restore" (show the cached list, no request), or "wait" (a load is
		 * already in flight — subscribe to its completion, do not duplicate).
		 */
		function deleteChatLoadDecision(store) {
			if (store !== null && store !== undefined && store.inFlight === true) return "wait";
			if (store !== null && store !== undefined && store.autoLoaded === true) return "restore";
			return "load";
		}

		// 未归属任何工作区的会话统一归入该组（永远排在最后）。
		const UNGROUPED_WORKSPACE_KEY = "ungrouped";

		/**
		 * Pure grouping for the 删除会话 tab (exposed via __dshToolsTest so the
		 * Node smoke test can assert it without a DOM): flat session list →
		 * workspace groups. Group key = canonical workspace path; sessions
		 * without workspace info fall into a trailing「未分组」group. Groups are
		 * sorted by path (未分组 last); sessions within a group are sorted
		 * newest-first by createdAt (stable).
		 * @returns {Array<{key:string,title:string,path:string|null,sessions:object[]}>}
		 */
		function groupSessionsByWorkspace(sessions) {
			if (!Array.isArray(sessions)) return [];
			const groupsByKey = new Map();
			for (const session of sessions) {
				const ws = session === null || session === undefined ? undefined : session.workspace;
				const key = ws !== undefined && ws !== null && typeof ws.path === "string" && ws.path.length > 0 ? ws.path : UNGROUPED_WORKSPACE_KEY;
				let group = groupsByKey.get(key);
				if (group === undefined) {
					group = {
						key,
						title: key === UNGROUPED_WORKSPACE_KEY ? "未分组" : ws.title !== undefined && ws.title !== null && ws.title !== "" ? ws.title : ws.path,
						path: key === UNGROUPED_WORKSPACE_KEY ? null : ws.path,
						// 工作区目录总大小（v0.7.0）；未分组恒为 null。
						sizeBytes: key === UNGROUPED_WORKSPACE_KEY ? null : (typeof ws.sizeBytes === "number" ? ws.sizeBytes : null),
						sessions: [],
					};
					groupsByKey.set(key, group);
				}
				group.sessions.push(session);
			}
			const groups = Array.from(groupsByKey.values());
			groups.sort((a, b) => {
				if (a.key === UNGROUPED_WORKSPACE_KEY) return 1;
				if (b.key === UNGROUPED_WORKSPACE_KEY) return -1;
				return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
			});
			for (const group of groups) {
				group.sessions.sort((a, b) => {
					const ta = typeof a.createdAt === "number" ? a.createdAt : 0;
					const tb = typeof b.createdAt === "number" ? b.createdAt : 0;
					return tb - ta;
				});
			}
			return groups;
		}

		function DeleteChatPanel(props) {
			const close = props === undefined || props === null ? undefined : props.close;
			const [tab, setTab] = React.useState("archived");
			const [data, setData] = React.useState({ loading: true, error: null, sessions: [] });
			const [selected, setSelected] = React.useState({});
			const [expanded, setExpanded] = React.useState({});
			const [confirm, setConfirm] = React.useState(null);
			const [busy, setBusy] = React.useState(false);
			const [notice, setNotice] = React.useState(null);
			const dataRef = React.useRef(data);
			const excludeIdsRef = React.useRef(new Set());
			React.useEffect(() => { dataRef.current = data; }, [data]);

			const load = (opts) => {
				const silent = opts !== undefined && opts !== null && opts.silent === true && Array.isArray(dataRef.current.sessions) && dataRef.current.sessions.length > 0;
				if (!silent) setData({ loading: true, error: null, sessions: [] });
				deleteChatStore.inFlight = true;
				const request = apiDelete("list");
				deleteChatStore.promise = request;
				request.then((sessions) => {
					const filtered = Array.isArray(sessions) ? sessions.filter((s) => !excludeIdsRef.current.has(s.id)) : [];
					const data = { loading: false, error: null, sessions: filtered, loadedAt: Date.now() };
					deleteChatStore.data = data;
					deleteChatStore.inFlight = false;
					deleteChatStore.promise = null;
					deleteChatStore.autoLoaded = true;
					setData(data);
				}, (err) => {
					const message = "加载失败: " + String((err && err.message) || err);
					deleteChatStore.inFlight = false;
					deleteChatStore.promise = null;
					deleteChatStore.autoLoaded = true;
					if (silent) {
						setData(Object.assign({}, dataRef.current, { error: null, loading: false, loadedAt: Date.now() }));
						setNotice(message);
					} else {
						const data = { loading: false, error: message, sessions: [], loadedAt: Date.now() };
						deleteChatStore.data = data;
						setData(data);
					}
				});
			};

			React.useEffect(() => {
				const decision = deleteChatLoadDecision(deleteChatStore);
				if (decision === "load") {
					load();
					return;
				}
				if (decision === "wait") {
					// 在途请求的完成回调挂在前一个面板实例上；订阅它，完成后
					// 把结果填回当前实例，避免卡在"加载中…"。
					const pending = deleteChatStore.promise;
					if (pending !== null && pending !== undefined) {
						pending.then(() => {
							const data = deleteChatStore.data;
							if (data !== null && data !== undefined) setData(data);
						}, () => {
							const data = deleteChatStore.data;
							if (data !== null && data !== undefined) setData(data);
						});
					} else {
						load();
					}
					setData({ loading: true, error: null, sessions: [] });
					return;
				}
				// restore: 上次结果仍缓存在本页面加载周期内，直接恢复，不发请求。
				const data = deleteChatStore.data;
				if (data !== null && data !== undefined) setData(data);
				else load();
			}, []);

			const sessions = data.sessions;
			const archived = sessions.filter((s) => s.archived);
			const selectedIds = Object.keys(selected).filter((id) => selected[id]);
			const selectedTargets = sessions.filter((s) => selected[s.id] === true);

			const openSession = (id) => {
				if (typeof ctx !== "undefined" && ctx !== null && ctx.sessions !== undefined && typeof ctx.sessions.open === "function") ctx.sessions.open(id);
				if (typeof close === "function") close();
			};

			const openFolder = (path) => {
				setBusy(true);
				apiDelete("open-folder", { path }).then((value) => {
					setBusy(false);
					setNotice(value && value.ok === true ? "已打开文件夹：" + path : "打开文件夹失败");
				}, (err) => {
					setBusy(false);
					setNotice("打开文件夹失败：" + String((err && err.message) || err));
				});
			};

			const requestDelete = (targets) => {
				setConfirm({ targets: targets.map((t) => ({ id: t.id, title: t.title, live: t.live })) });
			};

			const runDelete = () => {
				if (confirm === null || busy) return;
				const targets = confirm.targets;
				const anyLive = targets.some((t) => t.live);
				setBusy(true);
				const results = [];
				const work = (index) => {
					if (index >= targets.length) {
						const okCount = results.filter((r) => r.ok).length;
						const failed = results.filter((r) => !r.ok);
						const okIds = results.filter((r) => r.ok).map((r) => r.id);
						let text = "删除完成：成功 " + okCount + " 个，失败 " + failed.length + " 个。";
						if (failed.length > 0) text += " 失败项：" + failed.map((r) => (r.title || r.id) + "（" + r.reason + "）").join("；");
						setNotice(text);
						setConfirm(null);
						// 即使后端因会话仍处于活跃状态而继续返回它，也先在本地 UI 中隐藏已删除项。
						const okIdSet = new Set(okIds);
						for (const id of okIds) excludeIdsRef.current.add(id);
						setData((prev) => {
							const nextSessions = (prev.sessions || []).filter((s) => !okIdSet.has(s.id));
							const next = Object.assign({}, prev, { sessions: nextSessions });
							deleteChatStore.data = next;
							return next;
						});
						if (failed.length > 0) {
							// 部分/全部失败：保留失败会话的勾选，仅移除已成功删除的。
							const next = Object.assign({}, selected);
							for (const id of okIds) delete next[id];
							setSelected(next);
						} else {
							setSelected({});
						}
						setBusy(false);
						// 乐观更新：不自动重新拉取列表，删除结果即时反映在界面上；
						// 需要更新其他会话的磁盘占用/新会话时，用户可手动点「刷新」。
						return;
					}
					const target = targets[index];
					apiDelete("delete", { sessionId: target.id, confirmLive: anyLive }).then((res) => {
						const reason = deleteChatErrorText(res);
						results.push({ id: target.id, title: target.title, ok: res !== null && res !== undefined && res.ok === true, reason });
						work(index + 1);
					}, (err) => {
						results.push({ id: target.id, title: target.title, ok: false, reason: String((err && err.message) || err) });
						work(index + 1);
					});
				};
				work(0);
			};

			const toggleSelected = (id) => {
				const next = Object.assign({}, selected);
				if (next[id] === true) delete next[id];
				else next[id] = true;
				setSelected(next);
			};

			const allSelected = sessions.length > 0 && sessions.every((s) => selected[s.id] === true);
			const toggleAll = () => {
				const next = {};
				if (!allSelected) for (const s of sessions) next[s.id] = true;
				setSelected(next);
			};

			const toggleGroup = (key) => {
				const next = Object.assign({}, expanded);
				if (next[key] === true) delete next[key];
				else next[key] = true;
				setExpanded(next);
			};

			const toggleGroupAll = (group) => {
				const ids = group.sessions.map((s) => s.id);
				const allIn = ids.every((id) => selected[id] === true);
				const next = Object.assign({}, selected);
				for (const id of ids) {
					if (allIn) delete next[id];
					else next[id] = true;
				}
				setSelected(next);
			};

			const renderGroup = (group) => {
				const isOpen = expanded[group.key] === true;
				const ids = group.sessions.map((s) => s.id);
				const groupAll = ids.length > 0 && ids.every((id) => selected[id] === true);
				const groupSome = ids.some((id) => selected[id] === true);
				const groupSelectedCount = ids.reduce((n, id) => n + (selected[id] === true ? 1 : 0), 0);
				return el("div", { className: "dsh-delchat-group", key: group.key },
					el("div", { className: "dsh-delchat-group-head" },
						el("button", { className: "dsh-delchat-arrow", onClick: () => toggleGroup(group.key), title: isOpen ? "收起" : "展开", "aria-expanded": isOpen ? "true" : "false" }, isOpen ? "▾" : "▸"),
						el("input", { type: "checkbox", checked: groupAll, ref: (node) => { if (node !== null && node !== undefined) node.indeterminate = groupSome && !groupAll; }, onChange: () => toggleGroupAll(group) }),
						el("button", { className: "dsh-delchat-group-title", onClick: () => toggleGroup(group.key), title: group.path !== null ? group.path : undefined }, group.title),
						group.path !== null ? el("button", {
							type: "button",
							className: "dsh-delchat-muted dsh-delchat-group-path dsh-delchat-path-btn",
							title: "打开文件夹：" + group.path,
							disabled: busy,
							onClick: () => openFolder(group.path),
						}, group.path) : null,
						el("span", { className: "dsh-delchat-muted dsh-delchat-group-count" },
							group.sessions.length + " 个会话" + (groupSelectedCount > 0 ? "，已选 " + groupSelectedCount : "")
								+ (group.sizeBytes !== null && group.sizeBytes !== undefined ? " · 占用 " + formatBytes(group.sizeBytes) : "")),
					),
					isOpen ? el("div", { className: "dsh-delchat-group-body" }, group.sessions.map(renderRow)) : null,
				);
			};

			const renderBadges = (s) => [
				s.archived ? el("span", { className: "dsh-delchat-badge", key: "archived" }, "已归档") : null,
				s.live ? el("span", { className: "dsh-delchat-badge live", key: "live" }, "活跃") : null,
				s.persisted ? el("span", { className: "dsh-delchat-badge", key: "persisted" }, "已持久化") : null,
			];

			const renderRow = (s) => el("div", { className: "dsh-delchat-row", key: s.id },
				el("input", { type: "checkbox", checked: selected[s.id] === true, onChange: () => toggleSelected(s.id) }),
				el("span", { className: "dsh-delchat-title" }, s.title !== null && s.title !== undefined ? s.title : s.id),
				el("span", { className: "dsh-delchat-muted" }, formatTime(s.createdAt)),
				el("span", { className: "dsh-delchat-muted dsh-delchat-size", title: "占用磁盘空间" }, formatBytes(s.sizeBytes)),
				renderBadges(s),
				el("button", { className: "dsh-delchat-btn danger", disabled: busy, onClick: () => requestDelete([s]) }, "删除"),
			);

			const renderConfirm = () => {
				if (confirm === null) return null;
				const anyLive = confirm.targets.some((t) => t.live);
				const names = confirm.targets.map((t) => (t.title !== null && t.title !== undefined ? t.title : t.id));
				// 批量勾选可能非常多：只预览前几个名字，避免确认框被撑爆。
				const preview = names.length > 5 ? names.slice(0, 3).join("、") + " 等 " + names.length + " 个" : names.join("、");
				const text = anyLive
					? "以下 " + confirm.targets.length + " 个会话中有活跃会话：" + preview + "。删除后这些会话在本次运行内仍可继续对话，但新内容不再保存，程序重启后将彻底消失且不可恢复。确定删除？"
					: "确定删除以下 " + confirm.targets.length + " 个会话？删除后不可恢复：" + preview;
				return el("div", { className: "dsh-delchat-confirm" },
					el("div", null, text),
					el("div", { className: "dsh-delchat-bar" },
						el("button", { className: "dsh-delchat-btn danger", disabled: busy, onClick: runDelete }, busy ? "删除中…" : "确认删除"),
						el("button", { className: "dsh-delchat-btn", disabled: busy, onClick: () => setConfirm(null) }, "取消"),
					),
				);
			};

			const renderArchivedTab = () => {
				if (data.loading) return el("div", { className: "dsh-delchat-muted" }, "加载中…");
				if (data.error !== null) return el("div", { className: "dsh-delchat-muted" }, data.error);
				return el("div", null,
					el("div", { className: "dsh-delchat-bar" },
						el("button", { className: "dsh-delchat-btn", disabled: busy, onClick: () => load({ silent: true }) }, "刷新"),
						el("span", { className: "dsh-delchat-muted" },
							data.loadedAt !== undefined && data.loadedAt !== null ? "上次刷新 " + formatTime(data.loadedAt) : "",
						),
					),
					archived.length === 0
						? el("div", { className: "dsh-delchat-muted" }, "没有归档的会话。")
						: archived.map((s) => el("div", { className: "dsh-delchat-row", key: s.id },
							el("span", { className: "dsh-delchat-title" }, s.title !== null && s.title !== undefined ? s.title : s.id),
							el("span", { className: "dsh-delchat-muted" }, formatTime(s.createdAt)),
							el("span", { className: "dsh-delchat-muted dsh-delchat-size", title: "占用磁盘空间" }, formatBytes(s.sizeBytes)),
							s.live ? el("span", { className: "dsh-delchat-badge live" }, "活跃") : null,
							el("button", { className: "dsh-delchat-btn", onClick: () => openSession(s.id) }, "打开"),
							el("button", { className: "dsh-delchat-btn danger", disabled: busy, onClick: () => requestDelete([s]) }, "删除"),
						)),
				);
			};

			const renderDeleteTab = () => {
				if (data.loading) return el("div", { className: "dsh-delchat-muted" }, "加载中…");
				if (data.error !== null) return el("div", { className: "dsh-delchat-muted" }, data.error);
				if (sessions.length === 0) return el("div", { className: "dsh-delchat-muted" }, "没有会话。");
				const groups = groupSessionsByWorkspace(sessions);
				return el("div", { className: "dsh-delchat-tab-body" },
					el("div", { className: "dsh-delchat-bar" },
						el("input", { type: "checkbox", checked: allSelected, onChange: toggleAll }),
						el("span", { className: "dsh-delchat-muted" }, "全选"),
						el("button", { className: "dsh-delchat-btn danger", disabled: selectedIds.length === 0 || busy, onClick: () => requestDelete(selectedTargets) }, "删除所选（" + selectedIds.length + "）"),
						el("button", { className: "dsh-delchat-btn", disabled: busy, onClick: () => load({ silent: true }) }, "刷新"),
						el("span", { className: "dsh-delchat-muted" },
							data.loadedAt !== undefined && data.loadedAt !== null ? "上次刷新 " + formatTime(data.loadedAt) : "",
						),
					),
					groups.map(renderGroup),
					el("div", { className: "dsh-delchat-muted" }, "提示：删除后侧边栏中的条目会在页面刷新后消失。"),
				);
			};

			return el("div", { className: "dsh-delchat" },
				el("div", { className: "dsh-delchat-tabs" },
					el("button", { className: "dsh-delchat-tab" + (tab === "archived" ? " active" : ""), onClick: () => setTab("archived") }, "归档记录"),
					el("button", { className: "dsh-delchat-tab" + (tab === "delete" ? " active" : ""), onClick: () => setTab("delete") }, "删除会话"),
				),
				renderConfirm(),
				notice !== null ? el("div", { className: "dsh-delchat-notice" }, notice) : null,
				tab === "archived" ? renderArchivedTab() : renderDeleteTab(),
			);
		}

		// --- merged panel: 插件开关 (from dsh-plugin-toggle) ---

		function PluginTogglePanel() {
			const [phase, setPhase] = React.useState("loading"); // loading | error | ready
			const [error, setError] = React.useState(null);
			const [plugins, setPlugins] = React.useState([]);
			const [busy, setBusy] = React.useState(null);
			const [notice, setNotice] = React.useState(null);
			const [changed, setChanged] = React.useState(false);
			const [descOpen, setDescOpen] = React.useState({});
			const pluginsRef = React.useRef([]);
			React.useEffect(() => { pluginsRef.current = plugins; }, [plugins]);

			const load = React.useCallback((opts) => {
				const silent = opts !== undefined && opts !== null && opts.silent === true && pluginsRef.current.length > 0;
				if (!silent) setPhase("loading");
				setError(null);
				apiToggle("list").then((value) => {
					setPlugins(value.plugins ?? []);
					setPhase("ready");
				}, (err) => {
					if (silent) {
						setNotice("刷新失败：" + String((err && err.message) || err));
						setPhase("ready");
					} else {
						setError(String((err && err.message) || err));
						setPhase("error");
					}
				});
			}, []);

			React.useEffect(() => {
				load();
			}, [load]);

			const toggle = (p) => {
				if (busy !== null) return;
				const nextEnabled = !p.enabled;
				setBusy(p.name);
				setNotice(null);
				// 乐观更新：立即翻转本地开关，避免等待网络往返造成卡顿/拖影
				// （与「功能开关」页签的 feature 开关实现保持一致）。
				setPlugins((prev) => prev.map((pl) => pl.name === p.name ? Object.assign({}, pl, { enabled: nextEnabled }) : pl));
				apiToggle("set", { name: p.name, enabled: nextEnabled }).then((value) => {
					setBusy(null);
					setChanged(true);
					// 用服务端结果修正激活态，避免整表 reload 造成闪烁。
					setPlugins((prev) => prev.map((pl) => pl.name === p.name ? Object.assign({}, pl, {
						enabled: value.enabled === true,
						...(value.isBundle === true ? { inBundles: value.enabled === true } : { inPatch: value.enabled === true }),
					}) : pl));
				}, (err) => {
					setBusy(null);
					// 失败回滚为乐观翻转前的状态。
					setPlugins((prev) => prev.map((pl) => pl.name === p.name ? Object.assign({}, pl, { enabled: !nextEnabled }) : pl));
					setNotice("操作失败：" + String((err && err.message) || err));
				});
			};

			// 重启入口统一在「功能开关」页签顶部的一键重启卡片（restart.web 常驻功能）。

			return el("div", { className: "pt" },
				el("div", { className: "pt-bar" },
					el("h3", { className: "pt-heading" }, "已安装的插件", el("span", null, phase === "ready" ? "（" + plugins.length + "）" : "")),
					el("button", { className: "pt-btn", disabled: phase === "loading" || busy !== null, onClick: () => load({ silent: true }) }, "刷新"),
				),
				el("p", { className: "pt-hint" }, "开关写入 profile 激活层（cordis.patch.yml / bundles），不会卸载插件；改动在重启 dsh web 后生效。重启按钮位于「功能开关」页签顶部。"),
				phase === "loading" ? el("p", { className: "pt-muted" }, "正在读取已安装插件…") : null,
				phase === "error" ? el("div", { className: "pt-error" }, error + "（可稍后点击“刷新”重试）") : null,
				notice !== null ? el("div", { className: "pt-notice", role: "status" }, notice) : null,
				changed ? el("div", { className: "pt-restart", role: "status" },
					el("span", null, "激活层已修改，重启 dsh web 后生效（可到「功能开关」页签顶部一键重启）。"),
				) : null,
				phase === "ready" && plugins.length === 0 ? el("p", { className: "pt-muted" }, "profile 里没有已安装的插件。") : null,
				phase === "ready" && plugins.length > 0 ? el("ul", { className: "pt-list" },
					plugins.map((p) => el("li", { className: "pt-row", key: p.name },
						el("div", { className: "pt-info" },
							typeof p.home === "string" && p.home.length > 0
								? el("a", { className: "pt-name pt-name-link", href: p.home, target: "_blank", rel: "noopener noreferrer", title: "在 GitHub 打开 " + p.name }, p.name)
								: el("span", { className: "pt-name", title: p.name }, p.name),
							el("span", { className: "pt-meta" },
								"v" + p.version,
								p.isBundle ? " · bundle" : "",
								p.isBundle
									? (p.inBundles ? " · 已在 bundles 激活" : " · 未在 bundles 激活")
									: (p.inPatch ? " · 已有 patch 激活行" : " · 无 patch 激活行"),
							),
							(p.descriptions !== undefined && p.descriptions.length > 0)
								? el("div", { className: "pt-desc-wrap" },
									el("button", {
										type: "button",
										className: "pt-desc-toggle",
										onClick: () => setDescOpen((prev) => Object.assign({}, prev, { [p.name]: prev[p.name] !== true })),
									}, descOpen[p.name] === true ? "▾ 收起说明" : "▸ 查看说明"),
									descOpen[p.name] === true
										? el("div", { className: "pt-desc" },
											p.descriptions.map((d, i) => el("div", { className: "pt-desc-line", key: i }, d)),
										)
										: null,
								)
								: null,
						),
						el("button", {
							type: "button",
							role: "switch",
							"aria-checked": p.enabled ? "true" : "false",
							"aria-label": (p.enabled ? "停用 " : "启用 ") + p.name,
							className: "pt-switch" + (p.enabled ? " on" : ""),
							disabled: busy !== null,
							onClick: () => toggle(p),
						},
							el("span", { className: "pt-track" }, el("span", { className: "pt-thumb" })),
							el("span", { className: "pt-label" }, p.enabled ? "已启用" : "已停用"),
						),
					)),
				) : null,
			);
		}

		// --- merged panel: 更新检查 (from dsh-update-plugin) ---

		// 更新检查的模块级状态：页面加载（=dsh web 启动后）时重置，
		// 因此每次 dsh web 启动后只有「首次打开更新检查面板」会触发自动检查；
		// 之后打开直接恢复上次结果，用户手动点「重新检查」才再次发起请求。
		const updateCheckStore = { autoChecked: false, inFlight: false, promise: null, data: null };

		/**
		 * Pure auto-check decision for the 更新检查 panel (exposed via
		 * __dshToolsTest so the Node smoke test can assert it without a DOM).
		 * @returns "check" (first open after page load — run the check),
		 * "restore" (show the cached result, no request), or "wait" (a check
		 * is already in flight — do not duplicate it).
		 */
		function updateCheckDecision(store) {
			if (store !== null && store !== undefined && store.inFlight === true) return "wait";
			if (store !== null && store !== undefined && store.autoChecked === true) return "restore";
			return "check";
		}

		// DeepSeek Harness 版本检查的模块级状态：与插件更新检查一致，只在页面加载后
		// 首次打开时自动检查；之后打开恢复上次结果，手动「重新检查」才再次请求。
		const harnessCheckStore = { autoChecked: false, inFlight: false, promise: null, data: null };

		/**
		 * Pure auto-check decision for the harness version card (exposed via
		 * __dshToolsTest so the Node smoke test can assert it without a DOM).
		 * @returns "check" (first open after page load — run the check),
		 * "restore" (show the cached result, no request), or "wait" (a check
		 * is already in flight — do not duplicate it).
		 */
		function harnessCheckDecision(store) {
			if (store !== null && store !== undefined && store.inFlight === true) return "wait";
			if (store !== null && store !== undefined && store.autoChecked === true) return "restore";
			return "check";
		}

		/** Convert one harness-check payload into the card state shape. */
		function harnessStateFromData(data) {
			if (data === null || data === undefined) return { phase: "idle", current: "", latest: "", outdated: false, error: "" };
			const error = typeof data.error === "string" ? data.error : "";
			return {
				phase: error === "" ? "done" : "error",
				current: typeof data.current === "string" ? data.current : "",
				latest: typeof data.latest === "string" ? data.latest : "",
				outdated: data.outdated === true,
				error,
			};
		}

		function UpdateCheckPanel() {
			const [phase, setPhase] = React.useState("idle"); // idle | checking | done
			const [error, setError] = React.useState(null);
			const [plugins, setPlugins] = React.useState([]);
			const [busy, setBusy] = React.useState(null); // package name being updated
			const [rows, setRows] = React.useState({}); // name -> {updated,newVersion,error}
			const [notice, setNotice] = React.useState(null);
			const [checkedAt, setCheckedAt] = React.useState(null);

			const load = () => {
				setPhase("checking");
				setError(null);
				setNotice(null);
				updateCheckStore.inFlight = true;
				const request = apiUpdate("check");
				updateCheckStore.promise = request;
				request.then((res) => {
					const data = {
						plugins: Array.isArray(res.plugins) ? res.plugins : [],
						error: null,
						checkedAt: typeof res.checkedAt === "number" ? res.checkedAt : Date.now(),
					};
					updateCheckStore.data = data;
					updateCheckStore.inFlight = false;
					updateCheckStore.promise = null;
					updateCheckStore.autoChecked = true;
					setPlugins(data.plugins);
					setCheckedAt(data.checkedAt);
					setPhase("done");
				}, (err) => {
					const data = { plugins: [], error: "检查失败：" + String((err && err.message) || err), checkedAt: Date.now() };
					updateCheckStore.data = data;
					updateCheckStore.inFlight = false;
					updateCheckStore.promise = null;
					updateCheckStore.autoChecked = true;
					setError(data.error);
					setCheckedAt(data.checkedAt);
					setPhase("done");
				});
			};

			React.useEffect(() => {
				const decision = updateCheckDecision(updateCheckStore);
				if (decision === "check") {
					load();
					return;
				}
				if (decision === "wait") {
					// 在途请求的完成回调挂在前一个面板实例上；订阅它，完成后
					// 把结果填回当前实例，避免卡在"正在检查更新…"。
					const pending = updateCheckStore.promise;
					if (pending !== null && pending !== undefined) {
						pending.then(() => {
							const data = updateCheckStore.data;
							if (data !== null && data !== undefined) {
								setPlugins(Array.isArray(data.plugins) ? data.plugins : []);
								setError(data.error === null || data.error === undefined ? null : data.error);
								setCheckedAt(data.checkedAt === null || data.checkedAt === undefined ? null : data.checkedAt);
								setPhase("done");
							}
						}, () => {
							const data = updateCheckStore.data;
							if (data !== null && data !== undefined) {
								setPlugins(Array.isArray(data.plugins) ? data.plugins : []);
								setError(data.error === null || data.error === undefined ? null : data.error);
								setCheckedAt(data.checkedAt === null || data.checkedAt === undefined ? null : data.checkedAt);
								setPhase("done");
							}
						});
					} else {
						load();
					}
					setPhase("checking");
					return;
				}
				// restore: 上次结果仍缓存在本页面加载周期内，直接恢复，不发起请求。
				const data = updateCheckStore.data;
				if (data !== null && data !== undefined) {
					setPlugins(Array.isArray(data.plugins) ? data.plugins : []);
					setError(data.error === null || data.error === undefined ? null : data.error);
					setCheckedAt(data.checkedAt === null || data.checkedAt === undefined ? null : data.checkedAt);
					setPhase("done");
				} else {
					load();
				}
			}, []);

			const updateRow = (name) => {
				if (busy !== null) return;
				setBusy(name);
				setRows(Object.assign({}, rows, { [name]: { updating: true } }));
				apiUpdate("update", { packageName: name }).then((res) => {
					const next = Object.assign({}, rows, { [name]: { updated: true, newVersion: res.version } });
					setRows(next);
					setBusy(null);
					setNotice("已更新 " + name + " 至 " + String(res.version || "最新") + "。重启 dsh web 后生效（可到「功能开关」页签顶部一键重启）。");
				}, (err) => {
					const next = Object.assign({}, rows, { [name]: { error: String((err && err.message) || err) } });
					setRows(next);
					setBusy(null);
				});
			};

			const uninstallRow = (name) => {
				if (busy !== null) return;
				const row = plugins.find((p) => p.name === name);
				const spec = row !== undefined && row.spec !== "" ? "（" + row.spec + "）" : "";
				if (!window.confirm("确定卸载 " + name + spec + "？该插件将从 profile 依赖中移除（pnpm remove），重启 dsh web 后生效；如需恢复请重新安装。")) return;
				setBusy(name);
				setRows(Object.assign({}, rows, { [name]: { uninstalling: true } }));
				apiUpdate("uninstall", { packageName: name }).then((res) => {
					const next = Object.assign({}, rows, { [name]: { uninstalled: true } });
					setRows(next);
					setBusy(null);
					setNotice("已卸载 " + name + "。重启 dsh web 后生效（可到「功能开关」页签顶部一键重启）。");
				}, (err) => {
					const next = Object.assign({}, rows, { [name]: { error: String((err && err.message) || err) } });
					setRows(next);
					setBusy(null);
				});
			};

			const renderUninstall = (p, state) => {
				if (state !== undefined && state.uninstalled === true) {
					return el("span", { className: "dsh-upd-ver latest" }, "已卸载 ✓");
				}
				if (p.name === "dsh-tools") {
					// 设置页自身所在插件：保留按钮保持排版统一，但禁用（灰色）。
					return el("button", { className: "dsh-upd-btn", disabled: true, title: "设置页所在插件，不可卸载" }, "卸载");
				}
				return el("button", {
					className: "dsh-upd-btn danger",
					disabled: busy !== null,
					onClick: () => uninstallRow(p.name),
				}, state !== undefined && state.uninstalling === true ? "卸载中…" : "卸载");
			};

			const outdated = plugins.filter((p) => p.outdated === true);
			const skipped = plugins.filter((p) => p.skip === true);
			const fresh = plugins.filter((p) => p.outdated !== true && p.skip !== true);

			const renderName = (p) => {
				if (typeof p.home === "string" && p.home.length > 0) {
					return el("a", { className: "dsh-upd-name dsh-upd-name-link", href: p.home, target: "_blank", rel: "noopener noreferrer", title: "在 GitHub 打开 " + p.name }, p.name);
				}
				return el("span", { className: "dsh-upd-name" }, p.name);
			};

			const renderRow = (p) => {
				const state = rows[p.name];
				if (p.outdated === true) {
					return el("div", { className: "dsh-upd-row", key: p.name },
						renderName(p),
						el("span", { className: "dsh-upd-ver" }, p.current),
						el("span", { className: "dsh-upd-arrow" }, "→"),
						el("span", { className: "dsh-upd-ver latest" }, p.latest),
						state !== undefined && state.updated === true
							? el("span", { className: "dsh-upd-ver latest" }, "已更新 ✓")
							: state !== undefined && state.uninstalled === true
								? null
								: el("button", {
									className: "dsh-upd-btn primary",
									disabled: busy !== null,
									onClick: () => updateRow(p.name),
								}, state !== undefined && state.updating === true ? "更新中…" : "更新"),
						renderUninstall(p, state),
						state !== undefined && state.error !== undefined
							? el("span", { className: "dsh-upd-row-error" }, state.error)
							: null,
					);
				}
				if (p.skip === true) {
					return el("div", { className: "dsh-upd-row", key: p.name },
						el("div", { className: "dsh-upd-skip-body" },
							el("div", { className: "dsh-upd-skip-name" }, renderName(p)),
							el("div", { className: "dsh-upd-skip-line" },
								el("span", { className: "dsh-upd-skip" }, String(p.spec)),
								el("span", { className: "dsh-upd-skip" }, " · 本地/远程引用安装，不支持自动更新检查"),
							),
						),
						renderUninstall(p, state),
						state !== undefined && state.error !== undefined
							? el("span", { className: "dsh-upd-row-error" }, state.error)
							: null,
					);
				}
				return el("div", { className: "dsh-upd-row", key: p.name },
					renderName(p),
					el("span", { className: "dsh-upd-ver" }, p.current),
					p.error !== undefined && p.error !== ""
						? el("span", { className: "dsh-upd-row-error" }, "版本查询失败：" + p.error)
						: el("span", { className: "dsh-upd-ver latest" }, "已是最新"),
					renderUninstall(p, state),
					state !== undefined && state.error !== undefined
						? el("span", { className: "dsh-upd-row-error" }, state.error)
						: null,
				);
			};

			const statusText = () => {
				if (phase === "idle") return "尚未检查，点击「重新检查」开始检查。";
				if (phase === "checking") return "正在检查更新…";
				if (error !== null) return "";
				const base = "共 " + plugins.length + " 个已安装插件，" + outdated.length + " 个可用更新。";
				return checkedAt === null ? base : base + "（上次检查 " + formatTime(checkedAt) + "）";
			};

			return el("div", { className: "dsh-upd" },
				el("div", { className: "dsh-upd-bar" },
					el("button", { className: "dsh-upd-btn", disabled: phase === "checking" || busy !== null, onClick: load }, phase === "checking" ? "检查中…" : "重新检查"),
					el("span", { className: "dsh-upd-status" }, statusText()),
				),
				error !== null ? el("div", { className: "dsh-upd-status error" }, error + "（可在联网后点击“重新检查”）") : null,
				notice !== null ? el("div", { className: "dsh-upd-notice" }, notice) : null,
				phase === "done" && plugins.length === 0
					? el("div", { className: "dsh-upd-muted" }, "没有通过插件市场安装的插件。")
					: null,
				outdated.length > 0
					? el("div", { className: "dsh-upd-section" },
						el("h3", { className: "dsh-upd-heading" }, "可用更新 ", el("span", null, "(" + outdated.length + ")")),
						outdated.map(renderRow),
					)
					: null,
				fresh.length > 0
					? el("div", { className: "dsh-upd-section" },
						el("h3", { className: "dsh-upd-heading" }, "已是最新 ", el("span", null, "(" + fresh.length + ")")),
						fresh.map(renderRow),
					)
					: null,
				skipped.length > 0
					? el("div", { className: "dsh-upd-section" },
						el("h3", { className: "dsh-upd-heading" }, "跳过检查 ", el("span", null, "(" + skipped.length + ")")),
						skipped.map(renderRow),
					)
					: null,
				phase === "done" && error === null
					? el("div", { className: "dsh-upd-muted" }, "提示：插件更新写入 profile 后，需重启 dsh web 才会加载新版本（可到「功能开关」页签顶部一键重启）。")
					: null,
			);
		}

		// --- plugin-catalog: 「插件分类」页（设置 → 插件 的新页签） ---

		// 分类与相位的中文文案（dsh-tools 全客户端为硬编码中文；与官方插件列表页文案一致）。
		const CATEGORY_LABELS = { official: "官方插件", installed: "已安装插件", local: "本地插件" };
		const PHASE_LABELS = { pending: "等待依赖", loading: "加载中", active: "已挂载", failed: "挂载失败", unloading: "卸载中" };

		/**
		 * 简化包名展示（与官方插件列表页同规则：去 scope、cordis: 前缀、
		 * cordis-plugin-、dsh-host-/dsh-client- 前缀）。
		 */
		function catalogModuleShortName(moduleName) {
			return (moduleName.startsWith("@") ? moduleName.slice(moduleName.indexOf("/") + 1) : moduleName)
				.replace(/^cordis:/, "")
				.replace(/^cordis-plugin-/, "")
				.replace(/^dsh-(?:host-|client-)?/, "");
		}

		/** 条目是否匹配搜索词（moduleName / entryId，大小写不敏感）。 */
		function catalogMatches(entry, normalizedQuery) {
			if (normalizedQuery.length === 0) return true;
			return [entry.moduleName, entry.entryId].some((value) => String(value).toLocaleLowerCase().includes(normalizedQuery));
		}

		/** 各分类的条目计数（仅统计三类内）。 */
		function catalogCounts(entries) {
			const counts = { official: 0, installed: 0, local: 0 };
			for (const entry of entries) {
				const c = entry.category;
				if (c === "official" || c === "installed" || c === "local") counts[c] += 1;
			}
			return counts;
		}

		/** 分类 + 搜索过滤（纯函数）。category 为 "all" 时不过滤分类。 */
		function catalogFilter(entries, category, query) {
			const normalizedQuery = String(query === undefined || query === null ? "" : query).trim().toLocaleLowerCase();
			return entries.filter((entry) =>
				(category === "all" || entry.category === category) && catalogMatches(entry, normalizedQuery));
		}

		/** 页签可见性判定：config 未到达或功能开启 → 注册；config 明确关闭 → 不注册。 */
		function catalogTabRegistration(cfg, key) {
			return featureEnabled(cfg, key);
		}

		/** 组件取数判定：功能关闭时不请求（直接显示已关闭提示）。 */
		function catalogFetchGate(cfg, key) {
			return featureEnabled(cfg, key) ? "fetch" : "disabled";
		}

		function PluginCatalogTab() {
			const cfg = useConfig();
			const [phase, setPhase] = React.useState("loading"); // loading | disabled | error | ready
			const [error, setError] = React.useState(null);
			const [entries, setEntries] = React.useState([]);
			const [query, setQuery] = React.useState("");
			const [category, setCategory] = React.useState("all"); // all | official | installed | local
			const [expanded, setExpanded] = React.useState(null);
			const [request, setRequest] = React.useState(0);

			const enabled = catalogFetchGate(cfg, "plugin-catalog") === "fetch";

			React.useEffect(() => {
				if (!enabled) {
					setPhase("disabled");
					return undefined;
				}
				let current = true;
				setPhase("loading");
				setError(null);
				api("plugin-catalog").then((value) => {
					if (!current) return;
					setEntries(Array.isArray(value.entries) ? value.entries : []);
					setPhase("ready");
				}, (err) => {
					if (!current) return;
					const message = String((err && err.message) || err);
					// 竞态兜底：页签尚在而宿主已关（如启动后 config 尚未到达的乐观窗口）。
					if (/disabled/i.test(message)) {
						setPhase("disabled");
					} else {
						setError(message);
						setPhase("error");
					}
				});
				return () => { current = false; };
			}, [enabled, request]);

			const counts = catalogCounts(entries);
			const total = entries.length;
			const filtered = catalogFilter(entries, category, query);

			React.useEffect(() => {
				if (expanded !== null && !filtered.some((entry) => entry.entryId === expanded)) setExpanded(null);
			}, [expanded, filtered]);

			const retry = () => setRequest((value) => value + 1);

			const chips = [
				{ id: "all", label: "全部" },
				{ id: "official", label: "官方插件" },
				{ id: "installed", label: "已安装插件" },
				{ id: "local", label: "本地插件" },
			];

			const renderCard = (entry) => {
				const title = catalogModuleShortName(entry.moduleName);
				const status = entry.fiberPhase === null || entry.fiberPhase === undefined
					? "未挂载"
					: (PHASE_LABELS[entry.fiberPhase] || entry.fiberPhase);
				const open = expanded === entry.entryId;
				const detailId = "pc-details-" + encodeURIComponent(entry.entryId);
				const categoryLabel = CATEGORY_LABELS[entry.category] || entry.category;
				const spec = entry.spec !== null && entry.spec !== undefined && entry.spec !== "" ? String(entry.spec) : null;
				return el("li", { className: "pc-card", key: entry.entryId, "data-plugin-entry": entry.entryId, "data-open": open ? "true" : undefined },
					el("button", {
						type: "button",
						className: "pc-card-head",
						"aria-expanded": open ? "true" : "false",
						"aria-controls": detailId,
						onClick: () => setExpanded(open ? null : entry.entryId),
					},
						el("span", { className: "pc-card-title", title: entry.moduleName }, title),
						el("span", { className: "pc-badge " + entry.category, title: categoryLabel }, categoryLabel),
						el("span", { className: "pc-trailing" },
							entry.enabled ? el("span", { className: "pc-dot", "data-phase": entry.fiberPhase ?? "unobserved", role: "img", "aria-label": status, title: status }) : null,
							el("span", { className: "pc-tag" }, entry.enabled ? "已启用" : "已停用"),
						),
					),
					open ? el("div", { className: "pc-details", id: detailId },
						el("code", null, entry.entryId),
						el("dl", null,
							el("div", null,
								el("dt", null, "来源"),
								el("dd", null, categoryLabel + (spec !== null ? " · " + spec : "")),
							),
							el("div", null, el("dt", null, "配置状态"), el("dd", null, entry.enabled ? "已启用" : "已停用")),
							entry.enabled ? el("div", null, el("dt", null, "Cordis 状态"), el("dd", null, status)) : null,
						),
					) : null,
				);
			};

			return el("div", { className: "pc" },
				el("div", { className: "pc-bar" },
					el("h3", { className: "pc-heading" }, "插件分类", el("span", null, phase === "ready" ? "（" + filtered.length + "）" : "")),
				),
				el("p", { className: "pc-hint" }, "官方：安装 Harness 自带 · 已安装：从插件市场 / GitHub / npm 安装 · 本地：本地开发（link:/file: 引用）"),
				phase === "disabled" ? el("p", { className: "pc-status" }, "该功能已关闭：请到「设置 → dsh 工具箱 → 功能开关」开启「插件分类视图」后使用。") : null,
				phase === "loading" ? el("p", { className: "pc-status" }, "正在读取插件…") : null,
				phase === "error" ? el("div", { className: "pc-error", role: "alert" },
					el("p", null, error),
					el("button", { type: "button", onClick: retry }, "重试"),
				) : null,
				phase === "ready" ? [
					el("label", { className: "pc-search", key: "search" },
						el("input", {
							type: "search",
							value: query,
							placeholder: "搜索插件",
							"aria-label": "搜索插件",
							onChange: (event) => setQuery(event.currentTarget.value),
						}),
					),
					el("div", { className: "pc-chips", key: "chips", role: "group", "aria-label": "插件分类" },
						chips.map((chip) => el("button", {
							type: "button",
							key: chip.id,
							className: "pc-chip" + (category === chip.id ? " on" : ""),
							"aria-pressed": category === chip.id ? "true" : "false",
							onClick: () => setCategory(chip.id),
						},
							chip.label + "（" + (chip.id === "all" ? total : counts[chip.id]) + "）",
						)),
					),
					total === 0 ? el("p", { className: "pc-empty", key: "empty" }, "暂无插件。") : null,
					total > 0 && filtered.length === 0 ? el("p", { className: "pc-empty", key: "empty-filter" }, "该分类下没有匹配的插件。") : null,
					filtered.length > 0 ? el("ul", { className: "pc-cards", key: "cards" }, filtered.map(renderCard)) : null,
				] : null,
			);
		}

		// --- settings page: 「dsh 工具箱」 ---

		function WechatPanel() {
			const cfg = useConfig();
			const [status, setStatus] = React.useState(null);
			const [error, setError] = React.useState("");
			const [hint, setHint] = React.useState("");
			const [busy, setBusy] = React.useState("");
			const [login, setLogin] = React.useState({ sessionKey: "", qrcodeDataUrl: "", status: "", message: "", awaitingVerifyCode: false, verifyCode: "" });
			const [allowText, setAllowText] = React.useState("");
			const [sessionMode, setSessionMode] = React.useState("room");
			const [media, setMedia] = React.useState({ loading: false, items: [] });
			const [aiForm, setAiForm] = React.useState({
				asr: { baseUrl: "", apiKey: "", model: "" },
				vision: { baseUrl: "", apiKey: "", model: "" },
				image: { baseUrl: "", apiKey: "", model: "" },
			});
			const pollRef = React.useRef(null);

			const wxConfig = featureConfigOf(cfg, "wechat.openclaw");

			React.useEffect(() => {
				if (cfg !== null) {
					const list = Array.isArray(wxConfig.allowFrom) ? wxConfig.allowFrom : [];
					setAllowText(list.join("\n"));
					setSessionMode(wxConfig.sessionMode === "per-user" ? "per-user" : "room");
				}
				// 只在 cfg 快照到达/变化时同步表单。
			}, [cfg]); // eslint-disable-line react-hooks/exhaustive-deps

			React.useEffect(() => {
				if (status === null || status.aiCapabilities === undefined) return;
				setAiForm((prev) => {
					const next = {};
					for (const id of ["asr", "vision", "image"]) {
						const cap = status.aiCapabilities[id] || {};
						next[id] = {
							baseUrl: prev[id].baseUrl !== "" ? prev[id].baseUrl : (cap.baseUrl || ""),
							apiKey: prev[id].apiKey,
							model: prev[id].model !== "" ? prev[id].model : (cap.model || ""),
						};
					}
					return next;
				});
			}, [status]);

			const loadStatus = React.useCallback(() => {
				apiWechat("status").then(setStatus, (err) => setError(String((err && err.message) || err)));
			}, []);

			const loadMedia = React.useCallback(() => {
				setMedia((prev) => Object.assign({}, prev, { loading: true }));
				apiWechat("media/list").then((items) => {
					setMedia({ loading: false, items: Array.isArray(items) ? items : [] });
				}, (err) => {
					setMedia({ loading: false, items: [] });
					setError(String((err && err.message) || err));
				});
			}, []);

			React.useEffect(() => {
				loadStatus();
				loadMedia();
				const timer = window.setInterval(loadStatus, 2000);
				return () => window.clearInterval(timer);
			}, [loadStatus, loadMedia]);

			React.useEffect(() => () => {
				if (pollRef.current !== null) window.clearInterval(pollRef.current);
			}, []);

			const stopLoginPoll = () => {
				if (pollRef.current !== null) {
					window.clearInterval(pollRef.current);
					pollRef.current = null;
				}
			};

			const pollLogin = () => {
				if (login.sessionKey === "") return;
				apiWechat("login/poll", { sessionKey: login.sessionKey }).then((value) => {
					setLogin((prev) => Object.assign({}, prev, {
						status: value.status,
						message: value.message || "",
						awaitingVerifyCode: value.awaitingVerifyCode === true,
					}));
					if (value.status === "confirmed" || value.status === "already_connected" || value.status === "failed" || value.status === "cancelled" || value.status === "expired") {
						stopLoginPoll();
						loadStatus();
					}
				}, () => {});
			};

			const startLogin = () => {
				setBusy("login");
				setError("");
				stopLoginPoll();
				apiWechat("login/start").then((value) => {
					setLogin({ sessionKey: value.sessionKey, qrcodeDataUrl: value.qrcodeDataUrl || "", status: "wait", message: "", awaitingVerifyCode: false, verifyCode: "" });
					pollRef.current = window.setInterval(pollLogin, 1500);
					setBusy("");
				}, (err) => {
					setError(String((err && err.message) || err));
					setBusy("");
				});
			};

			const submitVerify = () => {
				if (login.sessionKey === "" || login.verifyCode.trim() === "") return;
				apiWechat("login/verify", { sessionKey: login.sessionKey, code: login.verifyCode }).then(() => {
					setLogin((prev) => Object.assign({}, prev, { verifyCode: "", awaitingVerifyCode: false }));
				}, (err) => setError(String((err && err.message) || err)));
			};

			const cancelLogin = () => {
				if (login.sessionKey !== "") apiWechat("login/cancel", { sessionKey: login.sessionKey }).catch(() => {});
				stopLoginPoll();
				setLogin({ sessionKey: "", qrcodeDataUrl: "", status: "", message: "", awaitingVerifyCode: false, verifyCode: "" });
			};

			const saveConfig = (next) => {
				setFeatureConfig("wechat.openclaw", Object.assign({}, wxConfig, next)).then(loadStatus, (err) => setError(String((err && err.message) || err)));
			};

			const saveAllow = () => {
				const allowFrom = allowText.split("\n").map((s) => s.trim()).filter(Boolean);
				saveConfig({ allowFrom });
			};

			const allowSender = (userId) => {
				const current = Array.isArray(wxConfig.allowFrom) ? wxConfig.allowFrom : [];
				if (current.includes(userId)) return;
				saveConfig({ allowFrom: [...current, userId] });
				setHint("已加入白名单；若网关正在运行，需停止并重新启动网关（或重启 dsh web）后生效。");
			};

			const logoutAccount = (accountId) => {
				if (!window.confirm("确定注销微信账号 " + accountId + "？将删除本地登录凭据。")) return;
				setBusy("logout-" + accountId);
				setError("");
				apiWechat("account/logout", { accountId }).then(() => {
					loadStatus();
					setHint("已注销账号 " + accountId);
				}, (err) => setError(String((err && err.message) || err))).finally(() => setBusy(""));
			};

			const cleanMedia = () => {
				if (!window.confirm("确定清理所有微信聊天文件缓存？此操作只删除媒体缓存，不会删除账号凭据或会话记录。")) return;
				setBusy("clean-media");
				setError("");
				apiWechat("media/clean").then(() => {
					loadMedia();
					setHint("已清理微信聊天文件缓存。");
				}, (err) => setError(String((err && err.message) || err))).finally(() => setBusy(""));
			};

			const openMedia = (path) => {
				apiWechat("media/open", { path }).then((value) => {
					if (value !== null && typeof value === "object" && value.ok === false) setError(value.message || "打开失败");
				}, (err) => setError(String((err && err.message) || err)));
			};

			const setAiField = (id, field, value) => {
				setAiForm((prev) => Object.assign({}, prev, { [id]: Object.assign({}, prev[id], { [field]: value }) }));
			};

			const saveAiConfig = () => {
				setBusy("ai-config");
				setError("");
				apiWechat("ai/config", { capabilities: aiForm }).then(() => {
					loadStatus();
					setHint("AI 配置已保存到 ~/.openclaw/weixin-dsh/.env。");
				}, (err) => setError(String((err && err.message) || err))).finally(() => setBusy(""));
			};

			const startGateway = () => {
				setBusy("start");
				setError("");
				apiWechat("gateway/start").then((value) => {
					if (value !== null && typeof value === "object" && value.ok === false) setError(value.message || "启动失败");
					loadStatus();
					setBusy("");
				}, (err) => {
					setError(String((err && err.message) || err));
					setBusy("");
				});
			};

			const stopGateway = () => {
				setBusy("stop");
				apiWechat("gateway/stop").then(loadStatus, (err) => setError(String((err && err.message) || err))).finally(() => setBusy(""));
			};

			const gatewayRunning = status !== null && (status.gatewayState === "running" || status.gatewayState === "starting");
			const statusText = status === null
				? "读取中…"
				: status.gatewayState === "running"
					? (status.captureOnly === true ? "运行中（仅记录模式，白名单为空）" : "运行中")
					: status.gatewayState === "starting"
						? "启动中…"
						: status.gatewayState === "stopping"
							? "停止中…"
							: status.gatewayState === "error"
								? "异常：" + (status.lastError || "未知错误")
								: "已停止";
			const recentSenders = status !== null && Array.isArray(status.recentSenders) ? status.recentSenders : [];
			const aiCaps = status !== null && status.aiCapabilities !== undefined && status.aiCapabilities !== null ? status.aiCapabilities : {};

			return el("div", { className: "dt-wx-body" },
				el("div", { className: "dt-wx-row" },
					el("span", { className: "dt-wx-label" }, "网关状态"),
					el("span", { className: "dt-wx-text" }, statusText),
				),
				error !== "" ? el("div", { className: "dt-wx-muted", style: { color: "var(--dsw-alias-danger)" } }, error) : null,
				hint !== "" ? el("div", { className: "dt-wx-muted", style: { color: "var(--dsw-alias-state-business-primary)" } }, hint) : null,

				el("div", { className: "dt-wx-muted", style: { padding: "8px 10px", border: "1px solid var(--dsw-alias-border-l1)", borderRadius: 8, lineHeight: "20px" } },
					"使用说明：白名单为空时也可以启动网关（仅记录模式），所有消息都会被拦截并在「最近发送者 ID」里记录；用你想放行的微信给机器人发一条消息，复制显示的 ID 到「白名单」输入框（每行一个）保存，再重启网关即可生效。",
				),

				el("div", { className: "dt-wx-row" },
					el("span", { className: "dt-wx-label" }, "已登录账号"),
					el("div", { className: "dt-wx-text" },
						status === null || status.accounts === undefined || status.accounts.length === 0
							? el("span", { className: "dt-wx-muted" }, "未登录")
							: status.accounts.map((a) => el("div", { key: a.accountId, className: "dt-wx-row", style: { gap: 10 } },
								el("span", { className: "dt-wx-muted" }, a.accountId),
								el("span", { className: "dt-wx-muted" }, "登录于 " + (a.loginAt ? new Date(a.loginAt).toLocaleString() : "未知时间")),
								el("button", {
									type: "button",
									className: "dt-btn dt-wx-btn-danger",
									disabled: busy === "logout-" + a.accountId,
									onClick: () => logoutAccount(a.accountId),
								}, busy === "logout-" + a.accountId ? "注销中…" : "注销登录"),
							)),
					),
				),

				el("details", { className: "dt-wx-details" },
					el("summary", { className: "dt-wx-summary" }, "AI 能力"),
					el("div", { className: "dt-wx-body", style: { marginTop: 6 } },
						el("div", { className: "dt-wx-muted" }, "语音转文字：" + (aiCaps.asr && aiCaps.asr.configured ? "已配置（" + aiCaps.asr.model + "）" : "未配置")),
						el("div", { className: "dt-wx-muted" }, "图像理解：" + (aiCaps.vision && aiCaps.vision.configured ? "已配置（" + aiCaps.vision.model + "）" : "未配置（若已装 modlens，将自动提示 Agent 用 modlens_read_image）")),
						el("div", { className: "dt-wx-muted" }, "文生图：" + (aiCaps.image && aiCaps.image.configured ? "已配置（" + aiCaps.image.model + "）" : "未配置")),
						el("div", { className: "dt-wx-muted", style: { marginTop: 6 } }, "示例配置（写入 ~/.openclaw/weixin-dsh/.env）："),
						el("pre", { className: "dt-wx-pre" }, "AI_ASR_BASE_URL=https://your-gateway/v1\nAI_ASR_KEY=sk-xxx\nAI_ASR_MODEL=SenseVoiceSmall\n\nAI_VISION_BASE_URL=https://your-gateway/v1\nAI_VISION_KEY=sk-xxx\nAI_VISION_MODEL=qwen2.5-vl\n\nAI_IMAGE_BASE_URL=https://your-gateway/v1\nAI_IMAGE_KEY=sk-xxx\nAI_IMAGE_MODEL=gpt-image-2"),
						el("div", { className: "dt-wx-muted", style: { marginTop: 6 } }, "也可以只配一组全局：AI_GATEWAY_BASE_URL / AI_GATEWAY_KEY"),
						el("div", { className: "dt-wx-muted", style: { marginTop: 6 } }, "配置（写入 ~/.openclaw/weixin-dsh/.env，密钥不显示）："),
						[["asr", "语音转文字"], ["vision", "图像理解"], ["image", "文生图"]].map(([id, label]) => el("div", { key: id, className: "dt-wx-row", style: { gap: 6 } },
							el("span", { className: "dt-wx-muted", style: { minWidth: 70 } }, label),
							el("input", { className: "dt-wx-input", placeholder: "Base URL", value: aiForm[id].baseUrl, onChange: (e) => setAiField(id, "baseUrl", e.target.value) }),
							el("input", { className: "dt-wx-input", type: "password", placeholder: "API Key", value: aiForm[id].apiKey, onChange: (e) => setAiField(id, "apiKey", e.target.value) }),
							el("input", { className: "dt-wx-input", placeholder: "Model", value: aiForm[id].model, onChange: (e) => setAiField(id, "model", e.target.value) }),
						)),
						el("button", { type: "button", className: "dt-btn", disabled: busy === "ai-config", onClick: saveAiConfig, style: { marginTop: 6 } }, busy === "ai-config" ? "保存中…" : "保存 AI 配置"),
					),
				),

				el("div", { className: "dt-wx-row" },
					login.qrcodeDataUrl !== ""
						? el("img", { className: "dt-wx-qr", src: login.qrcodeDataUrl, alt: "微信登录二维码" })
						: el("span", { className: "dt-wx-muted" }, "尚未发起登录"),
					el("button", { type: "button", className: "dt-btn", disabled: busy === "login", onClick: startLogin }, busy === "login" ? "登录中…" : "扫码登录"),
					login.sessionKey !== "" ? el("button", { type: "button", className: "dt-btn", onClick: cancelLogin }, "关闭二维码") : null,
				),
				login.message !== "" ? el("div", { className: "dt-wx-muted" }, login.message) : null,
				(login.status === "confirmed" || login.status === "already_connected")
					? el("div", { className: "dt-wx-muted" }, "扫码成功。此二维码区域可用「取消登录」关闭；已保存的登录凭据不会被删除。")
					: null,
				login.awaitingVerifyCode
					? el("div", { className: "dt-wx-row" },
						el("input", {
							className: "dt-wx-input",
							value: login.verifyCode,
							placeholder: "手机微信显示的配对码",
							onChange: (e) => setLogin((prev) => Object.assign({}, prev, { verifyCode: e.target.value })),
						}),
						el("button", { type: "button", className: "dt-btn primary", onClick: submitVerify }, "提交配对码"),
					)
					: null,

				el("div", { className: "dt-wx-row" },
					el("span", { className: "dt-wx-label" }, "白名单"),
					el("textarea", {
						className: "dt-wx-textarea",
						value: allowText,
						placeholder: "每行一个微信 ID；留空 = 拒绝所有消息",
						onChange: (e) => setAllowText(e.target.value),
						onBlur: saveAllow,
					}),
				),
				el("div", { className: "dt-wx-muted" }, "白名单保存后，若网关正在运行，需要停止并重新启动网关（或重启 dsh web）后才会生效。"),
				el("div", { className: "dt-wx-row" },
					el("span", { className: "dt-wx-label" }, "最近发送者 ID"),
					el("div", { className: "dt-wx-text" },
						recentSenders.length === 0
							? el("span", { className: "dt-wx-muted" }, "暂无记录。启动网关后，让微信用户给机器人发一条消息即可看到。")
							: recentSenders.map((item) => el("div", { key: item.userId, className: "dt-wx-row", style: { gap: 10 } },
								el("span", { className: "dt-wx-muted" },
									item.userId + (item.allowed ? "（已放行）" : "（未放行）") + " · " + new Date(item.at).toLocaleTimeString(),
								),
								item.allowed
									? null
									: el("button", {
										type: "button",
										className: "dt-btn dt-wx-btn-success",
										onClick: () => allowSender(item.userId),
									}, "允许放行"),
							)),
					),
				),
				el("div", { className: "dt-wx-row" },
					el("span", { className: "dt-wx-label" }, "媒体缓存"),
					el("div", { className: "dt-wx-text" },
						media.loading
							? el("span", { className: "dt-wx-muted" }, "加载中…")
							: media.items.length === 0
								? el("span", { className: "dt-wx-muted" }, "暂无缓存文件。")
								: media.items.map((item) => el("div", { key: item.path, className: "dt-wx-row", style: { gap: 10 } },
									el("span", {
										className: "dt-wx-muted",
										title: "点击打开所在文件夹：" + item.path,
										style: { cursor: "pointer", textDecoration: "underline" },
										onClick: () => openMedia(item.path),
									}, item.name + " · " + formatBytes(item.size) + " · " + new Date(item.mtime).toLocaleString()),
								)),
						el("button", {
							type: "button",
							className: "dt-btn dt-wx-btn-danger",
							disabled: busy === "clean-media",
							onClick: cleanMedia,
							style: { marginTop: 4 },
						}, busy === "clean-media" ? "清理中…" : "清理聊天文件缓存"),
					),
				),
				el("div", { className: "dt-wx-row" },
					el("span", { className: "dt-wx-label" }, "会话模式"),
					el("select", {
						className: "dt-wx-select",
						value: sessionMode,
						onChange: (e) => {
							const next = e.target.value;
							setSessionMode(next);
							saveConfig({ sessionMode: next });
						},
					},
						el("option", { value: "room" }, "room（所有微信用户共享一个 DSH 会话）"),
						el("option", { value: "per-user" }, "per-user（每个微信用户独立会话）"),
					),
				),

				el("div", { className: "dt-wx-row" },
					gatewayRunning
						? el("button", { type: "button", className: "dt-btn", disabled: busy === "stop", onClick: stopGateway }, busy === "stop" ? "停止中…" : "停止网关")
						: el("button", { type: "button", className: "dt-btn primary", disabled: busy === "start", onClick: startGateway }, busy === "start" ? "启动中…" : "启动网关"),
				),
			);
		}

		function SettingsPage(props) {
			const close = props === undefined || props === null ? undefined : props.close;
			// settings.section runtime prop：标准 useSessions 选择器 hook（用量面板的数据源）。
			const useSessions = props === undefined || props === null ? undefined : props.useSessions;
			const cfg = useConfig();
			const [notice, setNotice] = React.useState(null);
			const [busy, setBusy] = React.useState(null);
			const [restart, setRestart] = React.useState({ phase: "idle", waited: 0 }); // idle | working | failed
			const pollRef = React.useRef(null);

			const stopPolling = () => {
				if (pollRef.current !== null) {
					window.clearInterval(pollRef.current);
					pollRef.current = null;
				}
			};
			React.useEffect(() => () => stopPolling(), []);

			const features = cfg === null ? [] : (cfg.features || []);
			// 任务完成提示（notify.task-done）的开关已并入顶部「任务完成提示」
			// 卡片（授权后才显示），不再出现在功能开关列表里（v0.7.2）。
			const optionalFeatures = features.filter((f) => f.alwaysOn !== true && f.key !== "notify.task-done");
			const [notifyPerm, setNotifyPerm] = React.useState(undefined); // Notification.permission
			React.useEffect(() => {
				if (typeof window.Notification !== "undefined") setNotifyPerm(window.Notification.permission);
			}, []);

			// DeepSeek Harness 版本检查卡片（harness.check，常驻，仅检查不升级）。
			// 与插件更新检查一致：模块级缓存，只在页面加载后首次打开自动检查，
			// 之后打开恢复上次结果，手动「重新检查」才再次请求。
			const [harness, setHarness] = React.useState({ phase: "idle", current: "", latest: "", outdated: false, error: "" });
			const harnessLoad = React.useCallback(() => {
				setHarness((prev) => Object.assign({}, prev, { phase: "checking", error: "" }));
				harnessCheckStore.inFlight = true;
				const request = api("harness-check");
				harnessCheckStore.promise = request;
				request.then((value) => {
					const data = harnessStateFromData(value);
					harnessCheckStore.data = data;
					harnessCheckStore.inFlight = false;
					harnessCheckStore.promise = null;
					harnessCheckStore.autoChecked = true;
					setHarness(data);
				}, (err) => {
					const data = harnessStateFromData({ current: "", latest: "", outdated: false, error: String((err && err.message) || err) });
					harnessCheckStore.data = data;
					harnessCheckStore.inFlight = false;
					harnessCheckStore.promise = null;
					harnessCheckStore.autoChecked = true;
					setHarness(data);
				});
			}, []);
			React.useEffect(() => {
				const decision = harnessCheckDecision(harnessCheckStore);
				if (decision === "check") {
					harnessLoad();
					return;
				}
				if (decision === "wait") {
					const pending = harnessCheckStore.promise;
					if (pending !== null && pending !== undefined) {
						pending.then(() => {
							const data = harnessCheckStore.data;
							if (data !== null && data !== undefined) setHarness(data);
						}, () => {
							const data = harnessCheckStore.data;
							if (data !== null && data !== undefined) setHarness(data);
						});
					} else {
						harnessLoad();
					}
					setHarness((prev) => Object.assign({}, prev, { phase: "checking", error: "" }));
					return;
				}
				const data = harnessCheckStore.data;
				if (data !== null && data !== undefined) setHarness(data);
				else harnessLoad();
			}, [harnessLoad]);

			// Tabbed feature navigation + draggable horizontal tab strip.
			// NOTE: no setPointerCapture here — capturing on the strip retargets
			// the synthesized click away from the tab buttons and tab switching
			// stops working entirely. Window-level listeners keep the drag alive
			// outside the strip while leaving the native click path untouched.
			const [activeTab, setActiveTab] = React.useState("manage");
			const tabsRef = React.useRef(null);
			const dragRef = React.useRef({ down: false, startX: 0, startScroll: 0, moved: false });
			const [tabDragging, setTabDragging] = React.useState(false);

			const onTabsPointerMoveWin = (event) => {
				const state = dragRef.current;
				const strip = tabsRef.current;
				if (!state.down || strip === null) return;
				const dx = event.clientX - state.startX;
				if (!state.moved && Math.abs(dx) > 4) state.moved = true;
				if (state.moved) strip.scrollLeft = state.startScroll - dx;
			};
			const endTabsDragWin = () => {
				dragRef.current.down = false;
				setTabDragging(false);
				window.removeEventListener("pointermove", onTabsPointerMoveWin);
				window.removeEventListener("pointerup", endTabsDragWin);
				window.removeEventListener("pointercancel", endTabsDragWin);
			};
			const onTabsPointerDown = (event) => {
				const strip = tabsRef.current;
				if (strip === null) return;
				dragRef.current = { down: true, startX: event.clientX, startScroll: strip.scrollLeft, moved: false };
				setTabDragging(true);
				window.addEventListener("pointermove", onTabsPointerMoveWin, { passive: true });
				window.addEventListener("pointerup", endTabsDragWin);
				window.addEventListener("pointercancel", endTabsDragWin);
			};
			React.useEffect(() => () => endTabsDragWin(), []);

			const beginPolling = () => {
				stopPolling();
				const startedAt = Date.now();
				pollRef.current = window.setInterval(() => {
					api("ping").then(() => {
						stopPolling();
						window.location.reload();
					}, () => {
						const waited = Math.round((Date.now() - startedAt) / 1000);
						if (waited >= 60) {
							stopPolling();
							setRestart({ phase: "failed", waited });
						} else {
							setRestart({ phase: "working", waited });
						}
					});
				}, 1000);
			};

			const doRestart = () => {
				if (!window.confirm("重启会中断当前正在运行的任务（历史记录保留）。确定现在重启 dsh web 吗？")) return;
				setNotice(null);
				setRestart({ phase: "working", waited: 0 });
				const bridge = typeof window.dshDesktop !== "undefined" ? window.dshDesktop : undefined;
				if (bridge !== undefined && typeof bridge.restartService === "function") {
					try {
						bridge.restartService().catch(() => {});
					} catch {}
					beginPolling();
					return;
				}
				api("restart", { port: window.location.port === "" ? 80 : Number(window.location.port) }).then(() => {
					beginPolling();
				}, (error) => {
					setRestart({ phase: "failed", waited: 0 });
					setNotice("重启失败：" + String((error && error.message) || error));
				});
			};

			const toggle = (feature) => {
				if (busy !== null) return;
				if (feature.alwaysOn === true) return; // 常驻功能无开关（宿主同样强制）
				const nextEnabled = !feature.enabled;
				setBusy(feature.key);
				setNotice(null);
				// 乐观更新（v0.7.1 实测颤抖修复）：点击立即翻转本地快照（开关动画
				// 直接播放），不等网络往返；失败时回滚为服务端权威快照。消除
				// 「点击→延迟→跳变」与 busy 期间全列禁用/文案替换造成的闪烁。
				if (cfg !== null && cfg !== undefined) {
					setConfig(Object.assign({}, cfg, {
						features: (cfg.features || []).map((f) => f.key === feature.key ? Object.assign({}, f, { enabled: nextEnabled }) : f),
					}));
				}
				api("config/set", { key: feature.key, enabled: nextEnabled }).then((snap) => {
					setConfig(snap);
					setBusy(null);
					const entry = (snap.features || []).find((f) => f.key === feature.key);
					// v0.7.2：不弹「已启用/已停用」提示——notice 出现/消失会改变
					// 布局高度，来回切换时页面上下颤抖；开关状态本身已是即时反馈。
					// The tab of a disabled feature disappears — land on 功能开关.
					if (entry !== undefined && entry.enabled !== true && activeTab === feature.key) setActiveTab("manage");
				}, (error) => {
					setBusy(null);
					// 回滚：拉取服务端权威快照（乐观翻转被还原）。
					refreshConfig();
					setNotice("操作失败：" + String((error && error.message) || error));
				});
			};

			const requestNotifyPerm = () => {
				if (typeof window.Notification === "undefined") {
					setNotice("当前浏览器不支持系统桌面通知");
					return;
				}
				window.Notification.requestPermission().then((perm) => {
					setNotifyPerm(perm);
					setNotice(perm === "granted"
						? "桌面通知已授权：任务完成时会在 Windows 屏幕右下角弹出系统提示框"
						: perm === "denied"
							? "桌面通知被拒绝：任务完成提示将回退为页面内提示框（可在浏览器站点设置中允许通知）"
							: "桌面通知未授权");
				}, () => {
					setNotice("通知授权请求失败，请重试");
				});
			};

			const tabs = tabModel(cfg);

			const renderHarnessCard = () => {
				const meta = harness.phase === "checking"
					? "正在检查 DeepSeek Harness 新版本…"
					: harness.phase === "error"
						? "检查失败：" + harness.error
						: harness.error !== ""
							? "检查失败：" + harness.error
							: harness.current === ""
								? "未获取到当前 DeepSeek Harness 版本"
								: harness.latest === ""
									? "当前 " + harness.current + "（未能获取最新版本）"
									: harness.outdated
										? "当前 " + harness.current + "，发现新版本 " + harness.latest
										: "当前 " + harness.current + "，已是最新版本";
				return el("div", { className: "dt-restart-card" },
					el("div", { className: "dt-restart-info" },
						el("span", { className: "dt-name" }, "DeepSeek Harness 版本"),
						el("span", { className: "dt-meta" }, meta),
					),
					el("button", {
						type: "button",
						className: "dt-btn",
						disabled: harness.phase === "checking",
						onClick: harnessLoad,
					}, harness.phase === "checking" ? "检查中…" : "重新检查"),
				);
			};

			const renderRestartCard = () => el("div", { className: "dt-restart-card" },
				el("div", { className: "dt-restart-info" },
					el("span", { className: "dt-name" }, "一键重启 dsh web"),
					el("span", { className: "dt-meta" },
						restart.phase === "working"
							? ("服务重启中，页面将自动刷新…（已等待 " + restart.waited + "s）")
							: restart.phase === "failed"
								? "未检测到服务恢复，请手动重启 dsh web。"
								: "重启服务并自动刷新页面——验证插件改动的最快方式",
					),
				),
				el("button", {
					type: "button",
					className: "dt-btn primary",
					disabled: restart.phase === "working",
					onClick: doRestart,
				}, restart.phase === "working" ? "重启中…" : "重启 dsh web"),
			);

			/**
			 * 「任务完成提示」卡片（v0.7.2 起由「桌面通知权限」改名而来）：
			 * 授权与开关合二为一——未授权时只显示授权按钮；授权完成后展示
			 * 启用/停用开关（调 toggle(notifyFeature)，同功能开关列表逻辑）。
			 */
			const renderNotifyCard = () => {
				const notifyFeature = (cfg === null || cfg === undefined ? [] : (cfg.features || [])).find((f) => f.key === "notify.task-done");
				const notifyOn = notifyFeature === undefined || notifyFeature.enabled === true;
				const metaText = notifyPerm === "granted"
					? (notifyOn
						? "已授权并启用：任务完成时在 Windows 屏幕右下角弹出系统提示框（置顶显示）"
						: "已授权但已停用：任务完成时不再弹提示（可在右侧重新启用）")
					: notifyPerm === "denied"
						? "已被拒绝：提示回退为页面内提示框（需在浏览器站点设置中允许通知后刷新）"
						: notifyPerm === "default"
							? "未授权：点击右侧按钮授权后，任务完成时在屏幕右下角弹出系统提示框"
							: "当前浏览器不支持系统桌面通知（提示回退为页面内提示框）";
				return el("div", { className: "dt-notify-card" },
					el("div", { className: "dt-restart-info" },
						el("span", { className: "dt-name" }, "任务完成提示"),
						el("span", { className: "dt-meta" }, metaText),
					),
					notifyPerm === "default"
						? el("button", { type: "button", className: "dt-btn primary", onClick: requestNotifyPerm }, "授权桌面通知")
						: notifyPerm === "granted"
							? el("button", {
								type: "button",
								role: "switch",
								"aria-checked": notifyOn ? "true" : "false",
								"aria-label": notifyOn ? "停用 任务完成提示" : "启用 任务完成提示",
								className: "dt-switch" + (notifyOn ? " on" : ""),
								disabled: busy !== null || notifyFeature === undefined,
								onClick: () => { if (notifyFeature !== undefined) toggle(notifyFeature); },
							},
								el("span", { className: "dt-track" }, el("span", { className: "dt-thumb" })),
								el("span", { className: "dt-label" }, notifyOn ? "已启用" : "已停用"),
							)
							: null,
				);
			};

			const mergedPanels = {
				"delete-chat": { heading: "会话管理", component: DeleteChatPanel },
				"plugin-toggle": { heading: "插件开关", component: PluginTogglePanel },
				"update-plugin": { heading: "更新检查", component: UpdateCheckPanel },
				"ui.usage": { heading: "应用用量", component: UsagePanel },
				"ui.enhance": { heading: "界面增强", component: EnhancePanel },
				"wechat.openclaw": { heading: "微信接入", component: WechatPanel },
			};

			const renderTabBody = () => {
				if (activeTab === "manage") {
					// Always-on cards first (DeepSeek Harness 版本检查 → 一键重启 →
					// 任务完成提示授权+开关合一), then the toggle list.
					return [
						el("div", { key: "harness-check" }, renderHarnessCard()),
						el("div", { key: "alwayson-restart" }, renderRestartCard()),
						el("div", { key: "notify-perm" }, renderNotifyCard()),
						cfg === null
							? el("p", { key: "loading", className: "dt-muted" }, "正在读取配置…")
							: el("ul", { key: "list", className: "dt-list" },
								optionalFeatures.map((feature) => el("li", { className: "dt-row", key: feature.key },
									el("div", { className: "dt-info" },
										el("span", { className: "dt-name" }, feature.label,
											feature.kind === "tool" ? el("span", { className: "dt-badge" }, "模型工具") : null,
										),
										el("span", { className: "dt-meta" }, feature.description),
									),
									el("button", {
										type: "button",
										role: "switch",
										"aria-checked": feature.enabled ? "true" : "false",
										"aria-label": (feature.enabled ? "停用 " : "启用 ") + feature.label,
										className: "dt-switch" + (feature.enabled ? " on" : ""),
										disabled: busy !== null,
										onClick: () => toggle(feature),
									},
										el("span", { className: "dt-track" }, el("span", { className: "dt-thumb" })),
										el("span", { className: "dt-label" }, feature.enabled ? "已启用" : "已停用"),
									),
								)),
							),
					];
				}
				const panel = mergedPanels[activeTab];
				if (panel !== undefined) {
					return el("div", { className: "dt-panel" },
						el("div", { className: "dt-panel-head" }, panel.heading),
						React.createElement(panel.component, panel.component === UsagePanel ? { close, useSessions } : { close }),
					);
				}
				return el("p", { className: "dt-muted" }, "该功能已停用或不可用。");
			};

			return el("div", { className: "dt-page" },
				el("div", { className: "dt-bar" },
					el("h3", { className: "dt-heading" }, "dsh 工具箱"),
				),
				el("p", { className: "dt-hint" }, "「功能开关」页签顶部为 DeepSeek Harness 版本检查、一键重启与任务完成提示（先授权，授权后可在卡片内开关），下方为可选功能的开关。页签超出宽度时按住左右拖动查看。"),
				el("div", {
					className: "dt-tabs" + (tabDragging ? " dragging" : ""),
					ref: tabsRef,
					onPointerDown: onTabsPointerDown,
				},
					tabs.map((tab) => el("button", {
						type: "button",
						key: tab.key,
						className: "dt-tab" + (activeTab === tab.key ? " active" : ""),
						"aria-selected": activeTab === tab.key ? "true" : "false",
						onClick: () => {
							if (dragRef.current.moved) return;
							setActiveTab(tab.key);
						},
					}, tab.label)),
				),
				notice !== null ? el("div", { className: "dt-notice", role: "status" }, notice) : null,
				el("div", { className: "dt-tab-body" }, renderTabBody()),
			);
		}

		// --- bottom-right task-done toasts ---

		/**
		 * Pure decision logic for one SSE message: whether to show a toast,
		 * and what it should say. Exposed via __dshToolsTest so the Node
		 * smoke test can assert it without a DOM.
		 */
		function evaluateTurnDone(msg, hasFocus, currentSessionId, byId) {
			if (msg === null || typeof msg !== "object" || msg.type !== "turn-done" || msg.data === undefined) return null;
			const sessionId = msg.data.sessionId;
			if (typeof sessionId !== "string") return null;
			if (hasFocus) return null;
			if (typeof currentSessionId === "string" && currentSessionId !== sessionId) return null;
			const summary = byId !== undefined && byId !== null ? byId[sessionId] : undefined;
			const title = summary !== undefined && summary !== null && summary.displayTitle ? summary.displayTitle : "会话任务已完成";
			return { sessionId, title };
		}

		/**
		 * Pure payload builder for the native desktop notification (Windows
		 * shows it frontmost at the screen's bottom-right). Exposed via
		 * __dshToolsTest for the Node smoke test.
		 */
		function nativeNoticePayload(decision) {
			return {
				title: decision.title,
				body: "任务已完成 · 点击回到会话",
				tag: "dsh-tools-turn-done-" + decision.sessionId,
			};
		}

		/**
		 * Pure tab-strip model for the settings page: the fixed 功能开关 tab
		 * plus one tab per ENABLED OPTIONAL panel feature (alwaysOn features
		 * live inside 功能开关 and get no tab of their own; ui.enhance is a
		 * normal panel feature and gets its 「界面增强」tab through this rule).
		 * Exposed via __dshToolsTest so the Node smoke test can assert tab
		 * derivation without a DOM.
		 */
		function tabModel(cfg) {
			const tabs = [{ key: "manage", label: "功能开关" }];
			if (cfg !== null && cfg !== undefined) {
				for (const feature of cfg.features || []) {
					if (feature.alwaysOn === true) continue;
					if (feature.panel === false) continue; // 非面板功能（如插件分类视图）不占页签
					if (feature.enabled === true) tabs.push({ key: feature.key, label: feature.label });
				}
			}
			return tabs;
		}

		function NotifyOverlay(props) {
			const cfg = useConfig();
			const enabled = featureEnabled(cfg, "notify.task-done");
			const [toasts, setToasts] = React.useState([]);
			const timersRef = React.useRef(new Set());

			const useSessions = props && typeof props.useSessions === "function" ? props.useSessions : undefined;
			const current = useSessions !== undefined ? useSessions((s) => s.current) : undefined;
			const byId = useSessions !== undefined ? useSessions((s) => s.byId) : undefined;
			const currentRef = React.useRef(current);
			currentRef.current = current;
			const byIdRef = React.useRef(byId);
			byIdRef.current = byId;

			const dismiss = (id) => {
				setToasts((prev) => prev.filter((t) => t.id !== id));
			};

			React.useEffect(() => {
				if (!enabled) return undefined;
				const source = new window.EventSource("/dsh-tools/api/events");
				source.onmessage = (event) => {
					let msg = null;
					try {
						msg = JSON.parse(event.data);
					} catch {
						return;
					}
					const hasFocus = window.document.hasFocus();
					const decision = evaluateTurnDone(msg, hasFocus, currentRef.current, byIdRef.current);
					const current = currentRef.current;
					const cur = typeof current === "string" ? current : (current === undefined || current === null ? String(current) : "[" + typeof current + "]");
					const perm = typeof window.Notification !== "undefined" ? window.Notification.permission : "unsupported";
					// 诊断日志：一行看全链路（消息 → 判定 → 焦点/当前会话/权限）。
					console.log("[dsh-tools] notify:", JSON.stringify({
						type: msg && msg.type,
						sessionId: msg && msg.data && typeof msg.data.sessionId === "string" ? msg.data.sessionId : undefined,
						hasFocus,
						current: cur,
						decision: decision === null ? null : decision.sessionId,
						permission: perm,
					}));
					if (decision === null) return;
					// Preferred: a native Windows desktop notification — the page
					// is unfocused here, so an in-page toast would be invisible.
					// Windows renders it frontmost at the screen's bottom-right.
					const Notification = typeof window.Notification !== "undefined" ? window.Notification : undefined;
					if (Notification !== undefined && Notification.permission === "granted") {
						try {
							const payload = nativeNoticePayload(decision);
							const notice = new Notification(payload.title, { body: payload.body, tag: payload.tag });
							console.log("[dsh-tools] notify: native shown:", payload.title);
							notice.onclick = () => {
								try {
									window.focus();
								} catch {}
								if (ctx !== undefined && ctx.sessions !== undefined && typeof ctx.sessions.open === "function") {
									ctx.sessions.open(decision.sessionId);
								}
								notice.close();
							};
							return;
						} catch (error) {
							// fall through to the in-page toast
						}
					}
					// Fallback: in-page toast (permission denied/default/unsupported).
					const id = "t" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
					setToasts((prev) => [...prev, { id, sessionId: decision.sessionId, title: decision.title }]);
					const timer = window.setTimeout(() => {
						timersRef.current.delete(timer);
						dismiss(id);
					}, 8000);
					timersRef.current.add(timer);
				};
				// EventSource auto-reconnects; nothing else to do on error.
				return () => {
					source.close();
					for (const timer of timersRef.current) window.clearTimeout(timer);
					timersRef.current.clear();
				};
			}, [enabled]);

			if (!enabled || toasts.length === 0) return null;

			const openSession = (toast) => {
				dismiss(toast.id);
				if (ctx !== undefined && ctx.sessions !== undefined && typeof ctx.sessions.open === "function") {
					ctx.sessions.open(toast.sessionId);
				}
			};

			return el("div", { className: "dt-toast-stack" },
				toasts.map((toast) => el("div", {
					key: toast.id,
					className: "dt-toast",
					role: "button",
					tabIndex: 0,
					onClick: () => openSession(toast),
					onKeyDown: (event) => {
						if (event.key === "Enter" || event.key === " ") {
							event.preventDefault();
							openSession(toast);
						}
					},
				},
					el("div", { className: "dt-toast-body" },
						el("div", { className: "dt-toast-title" }, toast.title),
						el("div", { className: "dt-toast-sub" }, "任务已完成 · 点击回到会话"),
					),
					el("button", {
						type: "button",
						className: "dt-toast-close",
						"aria-label": "关闭",
						onClick: (event) => {
							event.stopPropagation();
							dismiss(toast.id);
						},
					}, "×"),
				)),
			);
		}

		// --- 用户消息 Markdown 渲染（融合自 dsh-client-ui-custom，MIT © Yoli-mi） ---
		//
		// keyed slot `conversation.chat.node` 以 priority -1 覆盖 user / steering
		// 单元格的默认渲染：开启 ui.enhance 时用户消息气泡文本走 MarkdownText，
		// 关闭时回退原生渲染，外观与原生一致。
		// 平台原子（MarkdownText / MessageText / JsonBlock / Tooltip / 图标 /
		// writeClipboard / ImageGallery）来自 shell 静态表；气泡几何从
		// ui-conversation 的 MessageItem 复刻，保持视觉与原生一致。

		function markdownNodeRegistration(cfg) {
			if (cfg !== null && cfg !== undefined && cfg.features !== undefined && Array.isArray(cfg.features)) {
				const entry = cfg.features.find((f) => f.key === "ui.enhance");
				if (entry !== undefined && entry.enabled !== true) return false;
			}
			return true; // config 未到达时乐观注册
		}

		function UserMarkdownNodeView(props) {
			const node = props === undefined || props === null ? undefined : props.node;
			const loadImage = props === undefined || props === null ? undefined : props.loadImage;
			const t = props === undefined || props === null ? undefined : props.t;
			const data = node === undefined || node === null ? undefined : node.data;
			if (data === undefined) return null;
			const content = data.content;
			const text = [];
			const images = [];
			const rest = [];
			for (const block of content) {
				const b = block;
				if (b !== null && typeof b === "object" && b.type === "text" && typeof b.text === "string") text.push(b.text);
				else if (b !== null && typeof b === "object" && b.type === "image" && b.attachment !== undefined) images.push({ attachment: b.attachment });
				else rest.push(block);
			}
			const textJoined = text.join("");
			const showBubble = textJoined !== "" || rest.length > 0;
			const pad2 = (n) => String(n).padStart(2, "0");
			const clockText = () => {
				const time = data.time;
				if (typeof time !== "number") return null;
				const d = new Date(time);
				const n = new Date(Date.now());
				const clock = pad2(d.getHours()) + ":" + pad2(d.getMinutes());
				if (d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()) return clock;
				const md = d.getFullYear() === n.getFullYear() ? (d.getMonth() + 1) + "/" + d.getDate() : d.getFullYear() + "/" + (d.getMonth() + 1) + "/" + d.getDate();
				return md + " " + clock;
			};
			const [copied, setCopied] = React.useState(false);
			const onCopy = () => {
				UiPrimitives.writeClipboard(textJoined).then((ok) => {
					if (!ok) return;
					setCopied(true);
					window.setTimeout(() => setCopied(false), 1000);
				});
			};
			const labels = (() => {
				if (t === undefined || typeof t !== "function") return undefined;
				return {
					image: t("image.label"),
					open: t("image.openOriginal"),
					openNamed: (label) => t("image.openOriginalLabel", { label }),
					loading: t("image.loading"),
					loadFailed: t("image.loadFailed"),
					lightbox: { dialog: t("image.preview"), close: t("image.closePreview") },
				};
			})();
			const copyLabel = t !== undefined && typeof t === "function" ? t("copy") : "复制";
			const copiedLabel = t !== undefined && typeof t === "function" ? t("copied") : "已复制";
			const truncatedLabel = (total) => t !== undefined && typeof t === "function" ? t("json.truncated", { total }) : "已截断";
			const extraBlockLabel = t !== undefined && typeof t === "function" ? t("message.extraBlock") : "额外内容";
			const clock = clockText();
			const actions = el("div", { className: "dt-md-actions" },
				clock !== null ? el("span", { className: "dt-md-timeStart" }, clock) : null,
				el(Tooltip, { label: copied ? copiedLabel : copyLabel, side: "bottom" },
					el("button", {
						type: "button",
						className: "dt-md-action",
						"aria-label": copied ? copiedLabel : copyLabel,
						onClick: onCopy,
					}, copied ? el(IconCheckOutline16, null) : el(IconCopyOutline16, null)),
				),
			);
			return el("div", { className: "dt-md-userRow", "data-time-hover-root": "" },
				el("div", { className: "dt-md-userStack" },
					el(UiAttachment.ImageGallery, { images, load: loadImage, align: "end", labels }),
					showBubble ? el("div", { className: "dt-md-bubble" },
						el(MarkdownText, { text: textJoined }),
						rest.map((block, i) => el(JsonBlock, { key: "b" + i, label: extraBlockLabel, payload: block, truncatedLabel })),
					) : null,
				),
				actions,
			);
		}

		// --- 浮动历史记录条（融合自 dsh-client-ui-custom，MIT © Yoli-mi） ---
		//
		// 会话内容区边缘的浮动历史条：每条竖线 = 一个用户回合，悬停波浪
		// 高亮、点击平滑滚动到对应消息；「悬挂」让某回合无视数量限制常驻。
		// 位置/数量/悬挂存 dsh-tools featureConfig（ui.enhance）。details
		// slot（priority -1）与 assistant-actions slot 随功能开关注册/注销。

		// --- turns 模型：Chat 快照 → 回合列表 + DOM 跳转 ---

		const HS_PREVIEW_LIMIT = 60;

		function hsBlockText(block) {
			if (block === null || typeof block !== "object") return null;
			const candidate = block;
			const isText = candidate.type === "text" || candidate.kind === "text";
			return isText && typeof candidate.text === "string" ? candidate.text : null;
		}

		function hsJoinPreview(chunks) {
			const text = chunks
				.map(hsBlockText)
				.filter((chunk) => chunk !== null)
				.join(" ")
				.replace(/\s+/g, " ")
				.trim();
			return text.length > HS_PREVIEW_LIMIT ? text.slice(0, HS_PREVIEW_LIMIT) + "…" : text;
		}

		function hsPreviewOfNode(kind, data) {
			if (data === null || typeof data !== "object") return "";
			const payload = data;
			if (kind === "user" || kind === "steering") {
				return Array.isArray(payload.content) ? hsJoinPreview(payload.content) : "";
			}
			if (kind === "assistant") {
				return Array.isArray(payload.blocks) ? hsJoinPreview(payload.blocks) : "";
			}
			return "";
		}

		function hsNodeTurn(node) {
			const location = node === null || node === undefined ? undefined : node.location;
			if (location === null || typeof location !== "object") return undefined;
			const loc = location;
			if (loc.kind !== "turn" && loc.kind !== "step") return undefined;
			const turn = loc.turn === null || loc.turn === undefined ? undefined : loc.turn.turn;
			return typeof turn === "number" ? turn : undefined;
		}

		/** Chat 快照 → 已挂载窗口内的用户回合列表（window 顺序）。 */
		function buildTurns(snapshot) {
			const turns = [];
			if (snapshot === null || snapshot === undefined || typeof snapshot !== "object") return turns;
			if (!Array.isArray(snapshot.order) || snapshot.nodes === undefined || typeof snapshot.nodes.get !== "function") return turns;
			for (const key of snapshot.order) {
				const node = snapshot.nodes.get(key);
				if (node === undefined) continue;
				if (node.kind !== "user" && node.kind !== "steering") continue;
				const turnNumber = hsNodeTurn(node);
				let time;
				if (turnNumber !== undefined && snapshot.legacy !== undefined && snapshot.legacy.turnTimings !== undefined && typeof snapshot.legacy.turnTimings.get === "function") {
					const timing = snapshot.legacy.turnTimings.get(turnNumber);
					time = timing === undefined || timing === null ? undefined : timing.startTime;
				}
				turns.push({
					key,
					index: turns.length + 1,
					question: hsPreviewOfNode(node.kind, node.data),
					time,
					turn: turnNumber,
				});
			}
			return turns;
		}

		/** 数量限制只作用于非悬挂回合，悬挂回合按自然位置并回。limit<=0 = 全部。 */
		function mergeVisibleTurns(turns, limit, pinned) {
			if (limit <= 0) return Array.isArray(turns) ? [...turns] : [];
			const pinnedTurns = turns.filter((turn) => turn.turn !== undefined && pinned.has(turn.turn));
			const rest = turns.filter((turn) => turn.turn === undefined || !pinned.has(turn.turn));
			return [...pinnedTurns, ...rest.slice(-limit)].sort((a, b) => a.index - b.index);
		}

		function hsFindAnchorRow(key) {
			const rows = document.querySelectorAll("[data-chat-anchor-key]");
			for (const row of rows) {
				if (row.dataset.chatAnchorKey === key) return row;
			}
			return null;
		}

		/** 平滑滚动到回合行并闪烁强调标记（行不在挂载窗口时 no-op）。 */
		function jumpToTurn(key) {
			const row = hsFindAnchorRow(key);
			if (row === null) return;
			row.scrollIntoView({ behavior: "smooth", block: "start" });
			const previousShadow = row.style.boxShadow;
			row.style.transition = "box-shadow 240ms ease";
			row.style.boxShadow = "inset 3px 0 0 0 var(--dsu-accent, var(--dsw-alias-brand-primary))";
			window.setTimeout(() => {
				row.style.boxShadow = previousShadow;
				row.style.transition = "";
			}, 1600);
		}

		/** 读者当前所在回合：最后一次滚过阅读偏移的回合行；否则最顶部一行。 */
		function currentTurnKey(keys) {
			const OFFSET = 120;
			const byKey = new Map();
			const rows = document.querySelectorAll("[data-chat-anchor-key]");
			for (const row of rows) {
				const key = row.dataset.chatAnchorKey;
				if (key !== undefined) byKey.set(key, row);
			}
			let current = null;
			let topmost = null;
			for (const key of keys) {
				const row = byKey.get(key);
				if (row === undefined) continue;
				const top = row.getBoundingClientRect().top;
				if (topmost === null || top < topmost.top) topmost = { key, top };
				if (top <= OFFSET) current = key;
			}
			return current === null ? (topmost === null ? null : topmost.key) : current;
		}

		const HS_WAVE_WIDTH = { 0: 100, 1: 62, 2: 40, 3: 24 };
		const HS_IDLE_CURRENT = 68;
		const HS_IDLE_REST = 34;
		const HS_STRIP_WIDTH = 60;
		const HS_EDGE_MARGIN = 12;
		const HS_TOOLTIP_GAP = 8;
		const HS_MAX_STRIP_TURNS = 120;
		const HS_THROTTLE_MS = 300;
		const HS_MAX_BATCHES = 24;

		function HistoryStrip(props) {
			const useSession = props === undefined || props === null ? undefined : props.useSession;
			const loadOlder = props === undefined || props === null ? undefined : props.loadOlder;
			const sessionId = props === undefined || props === null ? undefined : props.sessionId;
			const t = props === undefined || props === null ? undefined : props.t;
			const cfg = useConfig();
			const hc = featureConfigOf(cfg, "ui.enhance");
			const historyLimit = typeof hc.historyLimit === "number" ? hc.historyLimit : 10;
			const position = hc.historyPosition === "left" ? "left" : hc.historyPosition === "right" ? "right" : "off";

			const chat = useSession === undefined ? undefined : useSession((s) => s.chat);
			const blank = useSession === undefined ? true : useSession((s) => s.blank);
			const openState = useSession === undefined ? "closed" : useSession((s) => s.openState);
			const hasMore = useSession === undefined ? false : useSession((s) => s.hasMore);
			const loadingOlder = useSession === undefined ? false : useSession((s) => s.loadingOlder);

			const pinnedNumbers = React.useMemo(() => {
				const set = new Set();
				const record = hc.pinnedTurns === null || hc.pinnedTurns === undefined ? {} : hc.pinnedTurns;
				const list = typeof sessionId === "string" ? record[sessionId] : undefined;
				if (Array.isArray(list)) for (const turn of list) set.add(turn);
				return set;
			}, [hc, sessionId]);

			const allTurns = React.useMemo(
				() => (blank === true || position === "off" || chat === undefined) ? [] : buildTurns(chat),
				[chat, blank, position],
			);
			const turns = React.useMemo(
				() => mergeVisibleTurns(allTurns, historyLimit, pinnedNumbers),
				[allTurns, historyLimit, pinnedNumbers],
			);

			const [activeKey, setActiveKey] = React.useState(null);
			const [hovered, setHovered] = React.useState(null);
			const [tooltipY, setTooltipY] = React.useState(0);
			const loadOlderRef = React.useRef(loadOlder);
			loadOlderRef.current = loadOlder;
			const loadedBatches = React.useRef(0);

			const stripRef = React.useRef(null);
			const [conversationLeft, setConversationLeft] = React.useState(null);
			React.useLayoutEffect(() => {
				const el = stripRef.current;
				if (el === null) return undefined;
				let frame = el;
				while (frame !== null && frame.style.gridTemplateColumns === "") frame = frame.parentElement;
				if (frame === null) return undefined;
				const measure = () => {
					const sidebar = frame.children[0];
					if (sidebar === undefined) return;
					const width = sidebar.getBoundingClientRect().width;
					setConversationLeft((previous) => previous !== null && Math.abs(previous - width) <= 1 ? previous : width);
				};
				measure();
				const observer = new ResizeObserver(measure);
				observer.observe(frame);
				return () => observer.disconnect();
			}, [position, blank, turns.length === 0]);

			// 全量历史：节流分页往回加载，直到条上有足够回合（数量上限或视觉上限）。
			const target = historyLimit > 0 ? Math.min(historyLimit, HS_MAX_STRIP_TURNS) : HS_MAX_STRIP_TURNS;
			const unpinnedCount = React.useMemo(
				() => allTurns.filter((turn) => turn.turn === undefined || !pinnedNumbers.has(turn.turn)).length,
				[allTurns, pinnedNumbers],
			);
			const pinnedMissing = React.useMemo(() => {
				if (pinnedNumbers.size === 0) return false;
				const loaded = new Set();
				for (const turn of allTurns) if (turn.turn !== undefined) loaded.add(turn.turn);
				for (const turn of pinnedNumbers) if (!loaded.has(turn)) return true;
				return false;
			}, [allTurns, pinnedNumbers]);
			const pagerDone = unpinnedCount >= target && !pinnedMissing;
			React.useEffect(() => {
				if (position === "off") return undefined;
				if (openState !== "open" || !hasMore || loadingOlder) return undefined;
				if (pagerDone) return undefined;
				if (loadedBatches.current >= HS_MAX_BATCHES) return undefined;
				const timer = window.setTimeout(() => {
					loadedBatches.current += 1;
					if (typeof loadOlderRef.current === "function") loadOlderRef.current();
				}, HS_THROTTLE_MS);
				return () => window.clearTimeout(timer);
			}, [position, openState, hasMore, loadingOlder, pagerDone]);

			// 当前回合标记：滚动/缩放时 rAF 节流扫描。
			React.useEffect(() => {
				if (position === "off" || turns.length === 0) return undefined;
				let raf = 0;
				const keys = turns.map((turn) => turn.key);
				const compute = () => {
					raf = 0;
					setActiveKey(currentTurnKey(keys));
				};
				const onScroll = () => {
					if (raf === 0) raf = window.requestAnimationFrame(compute);
				};
				compute();
				document.addEventListener("scroll", onScroll, true);
				window.addEventListener("resize", onScroll);
				return () => {
					document.removeEventListener("scroll", onScroll, true);
					window.removeEventListener("resize", onScroll);
					if (raf !== 0) window.cancelAnimationFrame(raf);
				};
			}, [turns, position]);

			if (blank === true || turns.length === 0 || position === "off") return null;

			const clearHover = () => setHovered(null);
			const leftAnchor = (conversationLeft === null ? 0 : conversationLeft) + HS_EDGE_MARGIN;
			const stripStyle = { width: HS_STRIP_WIDTH };
			if (position === "left" && conversationLeft !== null) stripStyle.left = leftAnchor;

			return el("div", {
				ref: stripRef,
				className: "dt-hs-strip " + (position === "left" ? "dt-hs-stripLeft" : "dt-hs-stripRight"),
				style: stripStyle,
				onMouseLeave: clearHover,
			},
				hovered !== null ? ReactDom.createPortal(
					el("div", {
						className: "dt-hs-tooltip" + (position === "left" ? " dt-hs-tooltipLeft" : ""),
						style: {
							top: Math.max(48, Math.min(tooltipY, window.innerHeight - 48)),
							...(position === "left" && conversationLeft !== null
								? { left: leftAnchor + HS_STRIP_WIDTH + HS_TOOLTIP_GAP }
								: {}),
						},
						role: "tooltip",
					},
						el("span", { className: "dt-hs-tooltipDot", "aria-hidden": "true" }),
						el("span", { className: "dt-hs-tooltipText" }, (turns[hovered] === undefined ? "" : turns[hovered].question) || "无文本"),
					),
					document.body,
				) : null,
				turns.map((turn, index) => {
					const isActive = activeKey === turn.key;
					const isPinned = turn.turn !== undefined && pinnedNumbers.has(turn.turn);
					const width = hovered === null
						? (isActive ? HS_IDLE_CURRENT : HS_IDLE_REST)
						: (HS_WAVE_WIDTH[Math.min(3, Math.abs(index - hovered))] ?? HS_IDLE_REST);
					const level = hovered === null ? -1 : Math.min(3, Math.abs(index - hovered));
					const classes = ["dt-hs-bar"];
					if (isPinned) classes.push("dt-hs-barPinned");
					if (hovered !== null && level === 0) classes.push("dt-hs-barPeak");
					if (hovered !== null && level === 1) classes.push("dt-hs-barNear");
					if (hovered !== null && level === 2) classes.push("dt-hs-barFar");
					if (isActive) classes.push("dt-hs-barActive");
					return el("button", {
						key: turn.key,
						type: "button",
						className: classes.join(" "),
						style: { width: width + "%" },
						onMouseEnter: (event) => {
							setHovered(index);
							setTooltipY(event.currentTarget.getBoundingClientRect().top);
						},
						onClick: () => jumpToTurn(turn.key),
						"aria-label": "跳转到该回合",
					});
				}),
			);
		}

		// --- 悬挂（pin）：消息操作行的图钉按钮 ---

		function PinIcon(props) {
			const size = props === undefined || props === null ? undefined : props.size;
			return el("svg", {
				width: size === undefined ? 16 : size,
				height: size === undefined ? 16 : size,
				viewBox: "0 0 24 24",
				fill: "none",
				xmlns: "http://www.w3.org/2000/svg",
			},
				el("path", {
					fillRule: "evenodd",
					clipRule: "evenodd",
					d: "M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z",
					fill: "currentColor",
				}),
			);
		}

		function PinTurnAction(props) {
			const turn = props === undefined || props === null ? undefined : props.turn;
			const sessionId = props === undefined || props === null ? undefined : props.sessionId;
			const cfg = useConfig();
			const hc = featureConfigOf(cfg, "ui.enhance");
			const position = hc.historyPosition === "left" ? "left" : hc.historyPosition === "right" ? "right" : "off";
			const record = hc.pinnedTurns === null || hc.pinnedTurns === undefined ? {} : hc.pinnedTurns;
			const list = typeof sessionId === "string" ? record[sessionId] : undefined;
			const pinned = Array.isArray(list) && typeof turn === "number" && list.includes(turn);
			if (position === "off") return null;
			const label = pinned ? "取消悬挂" : "悬挂到历史条";
			const togglePin = () => {
				if (typeof turn !== "number" || typeof sessionId !== "string") return;
				const current = Array.isArray(list) ? list : [];
				const next = current.includes(turn) ? current.filter((n) => n !== turn) : [...current, turn].sort((a, b) => a - b);
				const updated = Object.assign({}, record);
				if (next.length === 0) delete updated[sessionId];
				else updated[sessionId] = next;
				setFeatureConfig("ui.enhance", Object.assign({}, hc, { pinnedTurns: updated }));
			};
			return el(Tooltip, { label, side: "bottom" },
				el("button", {
					type: "button",
					className: "dt-pin-action",
					"aria-label": label,
					"aria-pressed": pinned ? "true" : "false",
					"data-active": pinned ? "true" : undefined,
					onClick: togglePin,
				}, el(PinIcon, null)),
			);
		}

		/** ui.enhance 的注册门（历史条部分）：feature off 时注销 details/assistant-actions 条目。 */
		function historyRegistration(cfg) {
			if (cfg !== null && cfg !== undefined && cfg.features !== undefined && Array.isArray(cfg.features)) {
				const entry = cfg.features.find((f) => f.key === "ui.enhance");
				if (entry !== undefined && entry.enabled !== true) return false;
			}
			return true;
		}

		// --- 「界面增强」页签：历史条配置 + Markdown 渲染说明 ---

		function EnhancePanel() {
			const cfg = useConfig();
			const [notice, setNotice] = React.useState(null);
			const hc = featureConfigOf(cfg, "ui.enhance");
			const position = hc.historyPosition === "left" ? "left" : hc.historyPosition === "right" ? "right" : "off";
			const limit = typeof hc.historyLimit === "number" ? hc.historyLimit : 10;
			const [limitText, setLimitText] = React.useState(String(limit));
			React.useEffect(() => {
				setLimitText(String(typeof hc.historyLimit === "number" ? hc.historyLimit : 10));
			}, [cfg]);

			const save = (patch) => {
				setNotice(null);
				setFeatureConfig("ui.enhance", Object.assign({}, hc, patch)).then(() => {
					setNotice("历史条设置已保存");
				}, (error) => {
					setNotice("保存失败：" + String((error && error.message) || error));
				});
			};
			const saveLimit = () => {
				const parsed = Number(limitText);
				if (!Number.isFinite(parsed) || parsed < 0 || parsed > 500) {
					setNotice("回合数需为 0–500 的整数（0 = 显示全部）");
					setLimitText(String(limit));
					return;
				}
				save({ historyLimit: Math.floor(parsed) });
			};
			const posOptions = [
				{ id: "off", label: "关闭" },
				{ id: "right", label: "右侧" },
				{ id: "left", label: "左侧" },
			];

			return el("div", { className: "dt-panel" },
				el("div", { className: "dt-enh-row" },
					el("div", { className: "dt-enh-text" },
						el("span", { className: "dt-name" }, "浮动历史条"),
						el("span", { className: "dt-meta" }, "会话内容区边缘的历史记录条：悬停高亮、点击跳转对应回合。"),
					),
				),
				el("div", { className: "dt-enh-field" },
					el("span", { className: "dt-enh-label" }, "位置"),
					posOptions.map((option) => el("button", {
						key: option.id,
						type: "button",
						className: "dt-btn" + (position === option.id ? " primary" : ""),
						onClick: () => save({ historyPosition: option.id }),
					}, option.label)),
				),
				el("div", { className: "dt-enh-field" },
					el("span", { className: "dt-enh-label" }, "显示回合数"),
					el("input", {
						type: "number",
						className: "dt-enh-input",
						min: 0,
						max: 500,
						value: limitText,
						onChange: (event) => setLimitText(event.target.value),
						onBlur: saveLimit,
					}),
					el("span", { className: "dt-meta" }, "0 = 全部；悬挂的回合不受此限制"),
				),
				el("div", { className: "dt-enh-row" },
					el("div", { className: "dt-enh-text" },
						el("span", { className: "dt-name" }, "Markdown 渲染"),
						el("span", { className: "dt-meta" }, "用户消息按 Markdown 渲染（标题/列表/代码块/@引用），随「界面增强」开关整体启用/停用。"),
					),
				),
				notice !== null ? el("div", { className: "dt-notice", role: "status" }, notice) : null,
			);
		}

		// --- 应用用量统计（融合自 dsh-client-ui-custom，MIT © Yoli-mi） ---
		//
		// 纯客户端聚合：会话列表行已携带 Host 投影基线（projectionValues →
		// tokenUsage / sessionStats）+ updatedAt，无需额外 RPC。时间跨度与
		// 模型过滤决定聚合窗口；解码宽松，缺失/畸形投影按 0 计。

		const USAGE_RANGES = ["year", "month", "week", "days3"];
		const UG_DAY_MS = 86400000;

		function ugRangeStartMs(range, now) {
			switch (range) {
				case "year": return now - 365 * UG_DAY_MS;
				case "month": return now - 30 * UG_DAY_MS;
				case "week": return now - 7 * UG_DAY_MS;
				case "days3": return now - 3 * UG_DAY_MS;
			}
			return now - 7 * UG_DAY_MS;
		}

		function ugNum(value) {
			return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
		}

		/** 宽松解码一个会话行的投影值。 */
		function decodeUsageRow(updatedAt, projectionValues) {
			const usage = projectionValues === null || projectionValues === undefined ? undefined : projectionValues.tokenUsage;
			const stats = projectionValues === null || projectionValues === undefined ? undefined : projectionValues.sessionStats;
			const decodeBuckets = (value) => {
				if (value === null || typeof value !== "object") return null;
				return {
					uncachedInputTokens: ugNum(value.uncachedInputTokens),
					outputTokens: ugNum(value.outputTokens),
					cacheReadTokens: ugNum(value.cacheReadTokens),
					cacheWriteTokens: ugNum(value.cacheWriteTokens),
				};
			};
			const byModelRaw = usage !== null && typeof usage === "object" ? usage.byModel : undefined;
			let byModel = null;
			if (byModelRaw !== null && typeof byModelRaw === "object" && !Array.isArray(byModelRaw)) {
				byModel = {};
				for (const modelKey of Object.keys(byModelRaw)) {
					const decoded = decodeBuckets(byModelRaw[modelKey]);
					if (decoded !== null) byModel[modelKey] = decoded;
				}
				if (Object.keys(byModel).length === 0) byModel = null;
			}
			return {
				updatedAt,
				usage: decodeBuckets(usage),
				byModel,
				stats: stats === null || typeof stats !== "object"
					? null
					: {
						turns: ugNum(stats.turns),
						steps: ugNum(stats.steps),
						llmMs: ugNum(stats.llmMs),
						toolMs: ugNum(stats.toolMs),
					},
			};
		}

		function usageTokens(usage) {
			return usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens + usage.outputTokens;
		}

		/** 行的用量切片：模型过滤时取该模型的桶，否则取行总计；不可得为 null。 */
		function usageOfRow(row, modelKey) {
			if (modelKey === null) return row.usage;
			return row.byModel === null || row.byModel === undefined ? null : (row.byModel[modelKey] ?? null);
		}

		/** 模型选择器选项：`provider:model` 键，按首次出现顺序去重。 */
		function usageModelKeys(rows) {
			const keys = [];
			const seen = new Set();
			for (const row of rows) {
				if (row.byModel === null) continue;
				for (const modelKey of Object.keys(row.byModel)) {
					if (!seen.has(modelKey)) {
						seen.add(modelKey);
						keys.push(modelKey);
					}
				}
			}
			return keys;
		}

		function ugEmptyUsage() {
			return { sessions: 0, turns: 0, steps: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, llmMs: 0, toolMs: 0 };
		}

		/** 窗口内会话行聚合（模型过滤只计真正用过该模型的会话）。 */
		function aggregateUsage(rows, range, now, modelKey) {
			const cutoff = ugRangeStartMs(range, now);
			const total = ugEmptyUsage();
			for (const row of rows) {
				if (row.updatedAt < cutoff) continue;
				const usage = usageOfRow(row, modelKey);
				if (modelKey !== null && usage === null) continue;
				total.sessions += 1;
				if (row.stats !== null) {
					total.turns += row.stats.turns;
					total.steps += row.stats.steps;
					total.llmMs += row.stats.llmMs;
					total.toolMs += row.stats.toolMs;
				}
				if (usage !== null) {
					total.inputTokens += usage.uncachedInputTokens;
					total.outputTokens += usage.outputTokens;
					total.cacheReadTokens += usage.cacheReadTokens;
					total.cacheWriteTokens += usage.cacheWriteTokens;
				}
			}
			return total;
		}

		/** 趋势柱图桶：年=12 月、月=4 周、周/3天=按日；最后桶从今天起。 */
		function usageByBucket(rows, range, now, modelKey) {
			const cutoff = ugRangeStartMs(range, now);
			const spec = range === "year"
				? { count: 12, width: 30 * UG_DAY_MS }
				: range === "month"
					? { count: 4, width: 7 * UG_DAY_MS }
					: { count: range === "week" ? 7 : 3, width: UG_DAY_MS };
			const buckets = [];
			for (let index = 0; index < spec.count; index++) {
				buckets.push({ start: now - (spec.count - 1 - index) * spec.width, tokens: 0 });
			}
			for (const row of rows) {
				if (row.updatedAt < cutoff) continue;
				const usage = usageOfRow(row, modelKey);
				if (usage === null) continue;
				const age = now - row.updatedAt;
				const index = spec.count - 1 - Math.min(spec.count - 1, Math.floor(age / spec.width));
				buckets[index].tokens += usageTokens(usage);
			}
			return buckets;
		}

		/** 紧凑 token 数（1.2k / 3.4M）。 */
		function formatTokens(count) {
			if (count >= 1000000) return (count / 1000000).toFixed(2) + "M";
			if (count >= 1000) return (count / 1000).toFixed(1) + "k";
			return String(count);
		}

		/** 紧凑时长（45s / 12m 30s / 3h 12m）。 */
		function formatDuration(ms) {
			const seconds = Math.round(ms / 1000);
			if (seconds < 60) return seconds + "s";
			const minutes = Math.floor(seconds / 60);
			if (minutes < 60) return minutes + "m " + (seconds % 60) + "s";
			const hours = Math.floor(minutes / 60);
			return hours + "h " + (minutes % 60) + "m";
		}

		const UG_RANGE_LABELS = { year: "今年", month: "本月", week: "近 7 天", days3: "近 3 天" };

		function UsagePanel(props) {
			// settings.section runtime prop 注入的标准 useSessions 选择器 hook
			// （v0.7.0 实测：ctx.sessions.list 是 SnapshotStore 对象而非 hook，
			// 直接调用恒为 undefined → 面板永远空数据）。
			const useSessions = props === undefined || props === null ? undefined : props.useSessions;
			const list = typeof useSessions === "function" ? useSessions((value) => value) : { byId: {} };
			const [range, setRange] = React.useState("week");
			const [modelKey, setModelKey] = React.useState(null);
			const byId = list === undefined || list === null || list.byId === undefined ? {} : list.byId;
			const now = Date.now();
			const rows = Object.keys(byId).map((id) => decodeUsageRow(byId[id].updatedAt, byId[id].projectionValues));
			const modelKeys = usageModelKeys(rows);
			const activeModel = modelKey !== null && modelKeys.includes(modelKey) ? modelKey : null;
			const total = aggregateUsage(rows, range, now, activeModel);
			const buckets = usageByBucket(rows, range, now, activeModel);
			const maxTokens = Math.max(1, ...buckets.map((bucket) => bucket.tokens));
			const hitTokens = total.cacheReadTokens + total.inputTokens;
			const hitRate = hitTokens === 0 ? 0 : total.cacheReadTokens / hitTokens;

			const bucketLabel = (start) => {
				const date = new Date(start);
				if (range === "year") return date.toLocaleDateString(undefined, { month: "short" });
				if (range === "month") return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
				return date.toLocaleDateString(undefined, { weekday: "short" });
			};
			const modelLabel = (modelKeyText) => modelKeyText.replace(":", " / ");

			const top = Object.keys(byId)
				.map((id) => {
					const summary = byId[id];
					const row = decodeUsageRow(summary.updatedAt, summary.projectionValues);
					const usage = usageOfRow(row, activeModel);
					return {
						title: summary.displayTitle,
						updatedAt: summary.updatedAt,
						tokens: usage === null ? 0 : usageTokens(usage),
						missing: activeModel !== null && usage === null,
					};
				})
				.filter((entry) => !entry.missing && entry.updatedAt >= now - (range === "year" ? 365 : range === "month" ? 30 : range === "week" ? 7 : 3) * UG_DAY_MS)
				.sort((a, b) => b.tokens - a.tokens)
				.slice(0, 5);

			const empty = total.sessions === 0 && total.inputTokens === 0 && total.outputTokens === 0;

			return el("div", { className: "dt-ug-section" },
				el("div", { className: "dt-ug-toolbar" },
					el("div", { className: "dt-ug-tabs", role: "tablist", "aria-label": "用量时间范围" },
						USAGE_RANGES.map((id) => el("button", {
							key: id,
							type: "button",
							role: "tab",
							"aria-selected": id === range ? "true" : "false",
							className: id === range ? "dt-ug-tab dt-ug-tabActive" : "dt-ug-tab",
							onClick: () => setRange(id),
						}, UG_RANGE_LABELS[id])),
					),
					modelKeys.length > 0 ? el("select", {
						className: "dt-ug-model",
						value: activeModel === null ? "" : activeModel,
						onChange: (event) => setModelKey(event.target.value === "" ? null : event.target.value),
						"aria-label": "模型过滤",
					},
						el("option", { value: "", key: "" }, "全部模型"),
						modelKeys.map((key) => el("option", { value: key, key }, modelLabel(key))),
					) : null,
				),
				empty ? el("p", { className: "dt-ug-empty" }, "所选范围内暂无用量数据。") : el("div", { className: "dt-ug-section" },
					el("div", { className: "dt-ug-kpis" },
						el("div", { className: "dt-ug-kpi" },
							el("span", { className: "dt-ug-kpiLabel" }, "总量"),
							el("span", { className: "dt-ug-kpiValue" }, formatTokens(total.inputTokens + total.outputTokens + total.cacheReadTokens + total.cacheWriteTokens)),
						),
						el("div", { className: "dt-ug-kpi" },
							el("span", { className: "dt-ug-kpiLabel" }, "输入"),
							el("span", { className: "dt-ug-kpiValue" }, formatTokens(total.inputTokens)),
							el("span", { className: "dt-ug-kpiSub" }, formatTokens(total.cacheWriteTokens) + " write"),
						),
						el("div", { className: "dt-ug-kpi" },
							el("span", { className: "dt-ug-kpiLabel" }, "输出"),
							el("span", { className: "dt-ug-kpiValue" }, formatTokens(total.outputTokens)),
						),
						el("div", { className: "dt-ug-kpi" },
							el("span", { className: "dt-ug-kpiLabel" }, "缓存"),
							el("span", { className: "dt-ug-kpiValue" }, formatTokens(total.cacheReadTokens)),
							el("span", { className: "dt-ug-kpiSub" }, "命中率 " + (hitRate * 100).toFixed(1) + "%"),
						),
						el("div", { className: "dt-ug-kpi" },
							el("span", { className: "dt-ug-kpiLabel" }, "时长"),
							el("span", { className: "dt-ug-kpiValue" }, formatDuration(total.llmMs)),
							el("span", { className: "dt-ug-kpiSub" }, formatDuration(total.toolMs) + " tool"),
						),
						el("div", { className: "dt-ug-kpi" },
							el("span", { className: "dt-ug-kpiLabel" }, "会话"),
							el("span", { className: "dt-ug-kpiValue" }, String(total.sessions)),
							el("span", { className: "dt-ug-kpiSub" }, "步数 " + total.steps),
						),
					),
					el("div", { className: "dt-ug-breakdown" },
						el("span", { className: "dt-ug-breakdownLabel" }, "用量趋势"),
						el("div", { className: "dt-ug-bars" },
							buckets.map((bucket) => el("div", { key: bucket.start, className: "dt-ug-barWrap", title: formatTokens(bucket.tokens) },
								el("div", { className: "dt-ug-bar", style: { height: Math.max(2, Math.round((bucket.tokens / maxTokens) * 100)) + "%" } }),
								el("span", { className: "dt-ug-barLabel" }, bucketLabel(bucket.start)),
							)),
						),
					),
					top.length > 0 ? el("div", { className: "dt-ug-top" },
						el("span", { className: "dt-ug-breakdownLabel" }, "会话排行"),
						top.map((entry, index) => el("div", { key: entry.title + entry.updatedAt, className: "dt-ug-topRow" },
							el("span", { className: "dt-ug-topRank" }, String(index + 1)),
							el("span", { className: "dt-ug-topTitle" }, entry.title),
							el("span", { className: "dt-ug-topTokens" }, formatTokens(entry.tokens)),
						)),
					) : null,
				),
			);
		}

		let ctx = undefined;

		function apply(pluginCtx) {
			ctx = pluginCtx;
			ctx.slots.inject("settings.section", () => ctx.slots.register(
				{ name: "settings.section", id: "dsh-tools", order: 35, label: "dsh 工具箱" },
				(props) => React.createElement(SettingsPage, {
					close: props === undefined || props === null ? undefined : props.close,
					useSessions: props === undefined || props === null ? undefined : props.useSessions,
				}),
			));
			ctx.slots.inject("shell.overlay", () => ctx.slots.register(
				{ name: "shell.overlay", id: "dsh-tools-notify", order: 100, label: "dsh-tools 任务完成提示" },
				(props) => React.createElement(NotifyOverlay, props),
			));
			// 界面增强 - 用户消息 Markdown 渲染（ui.enhance）：keyed slot 注册/注销随功能
			// 开关联动——关闭时必须注销，否则 priority -1 的覆盖渲染器会赢走
			// 原生 user/steering 单元格（返回 null 会显示空白而非原生气泡）。
			ctx.slots.inject("conversation.chat.node", () => {
				const disposers = [];
				let lastShould = null; // 幂等缓存：任何配置变化都不重注册，只有开/关状态翻转才动
				const reconcile = () => {
					const should = markdownNodeRegistration(configStore);
					if (should === lastShould) return;
					lastShould = should;
					for (const dispose of disposers.splice(0)) {
						try { dispose(); } catch {}
					}
					if (!should) return;
					disposers.push(ctx.slots.register(
						{ name: "conversation.chat.node", key: "user", priority: -1, locale: "conversation" },
						(props) => React.createElement(UserMarkdownNodeView, props),
					));
					disposers.push(ctx.slots.register(
						{ name: "conversation.chat.node", key: "steering", priority: -1, locale: "conversation" },
						(props) => React.createElement(UserMarkdownNodeView, props),
					));
				};
				reconcile();
				configListeners.add(reconcile);
				return () => {
					configListeners.delete(reconcile);
					for (const dispose of disposers.splice(0)) {
						try { dispose(); } catch {}
					}
				};
			});
			// 界面增强 - 浮动历史条（ui.enhance）：details（priority -1，覆盖右侧栏）与
			// assistant-actions（悬挂按钮）随功能开关注册/注销。
			ctx.slots.inject("details", () => {
				let disposeEntry = null;
				let lastShould = null; // 幂等缓存：开关状态未翻转时不重注册（v0.7.0 实测重影/卡顿修复）
				const reconcile = () => {
					const should = historyRegistration(configStore);
					if (should === lastShould) return;
					lastShould = should;
					if (typeof disposeEntry === "function") {
						disposeEntry();
						disposeEntry = null;
					}
					if (!should) return;
					disposeEntry = ctx.slots.register(
						{
							name: "details",
							priority: -1,
							inject: (sessionId) => ({
								loadOlder: () => {
									const binding = ctx.sessions !== undefined ? ctx.sessions.binding(sessionId) : undefined;
									if (binding !== undefined && binding !== null && typeof binding.session.loadOlder === "function") {
										binding.session.loadOlder();
									}
								},
								sessionId,
							}),
						},
						(props) => React.createElement(HistoryStrip, props),
					);
				};
				reconcile();
				configListeners.add(reconcile);
				return () => {
					configListeners.delete(reconcile);
					if (typeof disposeEntry === "function") disposeEntry();
				};
			});
			ctx.slots.inject("conversation.chat.assistant-actions", () => {
				let disposeEntry = null;
				let lastShould = null;
				const reconcile = () => {
					const should = historyRegistration(configStore);
					if (should === lastShould) return;
					lastShould = should;
					if (typeof disposeEntry === "function") {
						disposeEntry();
						disposeEntry = null;
					}
					if (!should) return;
					disposeEntry = ctx.slots.register(
						{ name: "conversation.chat.assistant-actions", id: "dsh-tools-pin", order: 5 },
						(props) => React.createElement(PinTurnAction, props),
					);
				};
				reconcile();
				configListeners.add(reconcile);
				return () => {
					configListeners.delete(reconcile);
					if (typeof disposeEntry === "function") disposeEntry();
				};
			});
			// 「插件分类」页签（设置 → 插件）。注册/注销随功能开关联动：
			// 开关关闭时注销条目（官方 section 的页签列表会实时刷新，无需刷新页面）；
			// 开关重新打开时重新注册。启动时 config 未到达按乐观默认注册。
			ctx.slots.inject("settings.plugins.tab", () => {
				let disposeEntry = null;
				let lastShould = null; // 幂等缓存：开关状态未翻转时不重注册（v0.7.0 实测重影/卡顿修复）
				const reconcile = () => {
					const should = catalogTabRegistration(configStore, "plugin-catalog");
					if (should === lastShould) return;
					lastShould = should;
					if (typeof disposeEntry === "function") {
						disposeEntry();
						disposeEntry = null;
					}
					if (!should) return;
					disposeEntry = ctx.slots.register(
						{ name: "settings.plugins.tab", id: "plugin-catalog", order: 20, label: "插件分类" },
						(props) => React.createElement(PluginCatalogTab, props),
					);
				};
				reconcile();
				configListeners.add(reconcile);
				return () => {
					configListeners.delete(reconcile);
					if (typeof disposeEntry === "function") disposeEntry();
				};
			});
			return () => {
				ctx = undefined;
			};
		}

		exports.apply = apply;
		exports.inject = ["slots", "sessions"];
		exports.__dshToolsTest = { evaluateTurnDone, nativeNoticePayload, tabModel, updateCheckDecision, harnessCheckDecision, deleteChatLoadDecision, groupSessionsByWorkspace, formatBytes, markdownNodeRegistration, historyRegistration, buildTurns, mergeVisibleTurns, decodeUsageRow, aggregateUsage, usageByBucket, usageModelKeys, formatTokens, formatDuration, UsagePanel, catalogFilter, catalogCounts, catalogModuleShortName, catalogTabRegistration, catalogFetchGate };
		return module.exports;
	}
});
