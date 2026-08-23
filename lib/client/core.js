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
					'.dt-ug-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }',
					'.dt-ug-tabs { display: inline-flex; flex-wrap: wrap; gap: 6px; padding: 3px; border-radius: 10px; background: color-mix(in srgb, var(--dsw-alias-bg-base) 70%, transparent); border: 1px solid var(--dsw-alias-border-l2); width: fit-content; max-width: 100%; box-sizing: border-box; }',
					'.dt-ug-tab { height: 26px; padding: 0 10px; border: none; border-radius: 7px; background: none; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 26px; cursor: pointer; }',
					'.dt-ug-tabActive { background: var(--dsw-alias-brand-primary); color: var(--dsw-alias-label-primary-foreground); }',
					'.dt-ug-model { display: inline-block; height: 26px; max-width: 180px; min-width: 0; padding: 0 6px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 7px; background: color-mix(in srgb, var(--dsw-alias-bg-base) 70%, transparent); color: var(--dsw-alias-label-secondary); font-size: 12px; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
					'.dt-ug-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; }',
					'.dt-ug-kpi { display: flex; flex-direction: column; gap: 4px; padding: 12px 14px; border-radius: 12px; border: 1px solid var(--dsw-alias-border-l2); background: color-mix(in srgb, var(--dsw-alias-bg-base) 78%, transparent); }',
					'.dt-ug-kpiLabel { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary); }',
					'.dt-ug-kpiValue { font-size: 18px; line-height: 24px; font-weight: 600; color: var(--dsw-alias-label-primary); }',
					'.dt-ug-kpiSub { font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-tertiary); }',
					'.dt-ug-kpiSubRow { display: flex; align-items: center; justify-content: space-between; gap: 6px; width: 100%; }',
					'.dt-ug-priceModeBtn { flex: none; height: 20px; min-width: 28px; padding: 0 6px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 6px; background: color-mix(in srgb, var(--dsw-alias-bg-base) 70%, transparent); color: var(--dsw-alias-label-secondary); font-size: 11px; line-height: 18px; cursor: pointer; }',
					'.dt-ug-priceModeBtn:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }',
					'.dt-ug-priceModeBtn.peak { color: var(--dsw-alias-state-danger, #e5484d); border-color: color-mix(in srgb, var(--dsw-alias-state-danger, #e5484d) 45%, transparent); }',
					'.dt-ug-priceModeBtn.valley { color: var(--dsw-alias-state-success-primary, #30a46c); border-color: color-mix(in srgb, var(--dsw-alias-state-success-primary, #30a46c) 45%, transparent); }',
					'.dt-ug-breakdown { display: flex; flex-direction: column; gap: 8px; }',
					'.dt-ug-breakdownLabel { font-size: 13px; line-height: 20px; font-weight: 500; color: var(--dsw-alias-label-primary); }',
					'.dt-ug-bars { position: relative; display: flex; align-items: flex-end; gap: 6px; height: 120px; padding: 10px; border-radius: 12px; border: 1px solid var(--dsw-alias-border-l2); background: color-mix(in srgb, var(--dsw-alias-bg-base) 78%, transparent); }',
					'.dt-ug-tooltip { position: absolute; z-index: 20; max-width: 280px; padding: 8px 10px; border-radius: 8px; background: color-mix(in srgb, var(--dsw-alias-bg-overlay) 96%, transparent); border: 1px solid var(--dsw-alias-border-l2); box-shadow: 0 4px 16px rgb(0 0 0 / .25); font-size: 12px; line-height: 18px; pointer-events: none; white-space: nowrap; }',
					'.dt-ug-tooltipTitle { font-weight: 600; color: var(--dsw-alias-label-primary); margin-bottom: 2px; }',
					'.dt-ug-tooltipRow { display: flex; justify-content: space-between; gap: 14px; }',
					'.dt-ug-tooltipLabel { color: var(--dsw-alias-label-tertiary); }',
					'.dt-ug-tooltipValue { color: var(--dsw-alias-label-primary); font-weight: 500; }',
					'.dt-ug-custom { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; max-width: 100%; box-sizing: border-box; }',
					'.dt-ug-dateInput { height: 26px; padding: 0 8px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 7px; background: color-mix(in srgb, var(--dsw-alias-bg-base) 70%, transparent); color: var(--dsw-alias-label-primary); font-size: 12px; }',
					'.dt-ug-btn { height: 26px; padding: 0 10px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 7px; background: color-mix(in srgb, var(--dsw-alias-bg-base) 70%, transparent); color: var(--dsw-alias-label-secondary); font-size: 12px; cursor: pointer; }',
					'.dt-ug-btn:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }',
					'.dt-ug-sessionTable { display: flex; flex-direction: column; gap: 6px; max-height: 260px; overflow: auto; }',
					'.dt-ug-sessionHead, .dt-ug-sessionRow { display: grid; grid-template-columns: minmax(0, 1fr) 88px 88px 88px; gap: 8px; align-items: center; padding: 6px 10px; font-size: 12px; line-height: 18px; }',
					'.dt-ug-sessionHead { color: var(--dsw-alias-label-tertiary); }',
					'.dt-ug-sessionRow { border-radius: 8px; border: 1px solid var(--dsw-alias-border-l1); background: color-mix(in srgb, var(--dsw-alias-bg-base) 70%, transparent); }',
					'.dt-ug-sessionTitle { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-primary); }',
					'.dt-ug-sessionNum { text-align: right; color: var(--dsw-alias-label-primary); font-weight: 500; }',
					'.dt-ug-expandBtn { align-self: flex-start; height: 26px; padding: 0 10px; border: none; border-radius: 7px; background: none; color: var(--dsw-alias-label-secondary); font-size: 12px; cursor: pointer; }',
					'.dt-ug-expandBtn:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }',
					'.dt-ug-priceConfig { display: flex; flex-direction: column; gap: 6px; width: 100%; max-width: 100%; box-sizing: border-box; }',
					'.dt-ug-priceTextarea { box-sizing: border-box; width: 100%; max-width: 100%; min-height: 120px; max-height: 240px; padding: 8px 10px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-label-primary); font: 12px/18px ui-monospace, SFMono-Regular, Consolas, monospace; resize: vertical; overflow: auto; }',
					'.dt-ug-priceError { font-size: 12px; line-height: 18px; color: var(--dsw-alias-state-danger, #e5484d); overflow-wrap: break-word; }',
					'.dt-ug-priceHint { font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-tertiary); overflow-wrap: break-word; }',
					'.dt-ug-note { font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-tertiary); }',
					'.dt-ug-totalCost { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }',
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

