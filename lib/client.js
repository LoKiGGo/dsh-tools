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
					'.dt-switch:disabled { opacity:.55; cursor:default; }',
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
					'.pt-switch:disabled { opacity:.55; cursor:default; }',
					'.pt-track { position:relative; width:32px; height:18px; border-radius:999px; background:var(--dsw-alias-bg-module-platform); border:1px solid var(--dsw-alias-border-l2); transition:background .16s,border-color .16s; flex:none; }',
					'.pt-thumb { position:absolute; top:1px; left:1px; width:14px; height:14px; border-radius:50%; background:var(--dsw-alias-label-secondary); transition:transform .16s, background .16s; }',
					'.pt-switch.on .pt-track { background:var(--dsw-alias-state-success-primary); border-color:transparent; }',
					'.pt-switch.on .pt-thumb { transform:translateX(14px); background:#fff; }',
					'.pt-label { white-space:nowrap; }',
					'.pt-btn { border:1px solid var(--dsw-alias-border-l2); color:var(--dsw-alias-label-primary); background:var(--dsw-alias-bg-layer-3); font:inherit; font-size:12px; cursor:pointer; border-radius:6px; padding:4px 12px; flex:none; }',
					'.pt-btn:hover:not(:disabled) { border-color:var(--dsw-alias-label-dimmed); }',
					'.pt-btn:disabled { opacity:.5; cursor:default; }',
					'.pt-btn.primary { color:#fff; background:var(--dsw-alias-state-business-primary); border-color:transparent; }',
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
					'.dsh-upd-row-error { color:var(--dsw-alias-state-error-primary); font-size:12px; }',
					'.dsh-upd-muted { color:var(--dsw-alias-label-tertiary); font-size:12px; }',
				].join("\n"),
			},
		];
		for (const entry of STYLES) {
			if (document.getElementById(entry.id) === null) {
				const tag = document.createElement("style");
				tag.id = entry.id;
				tag.textContent = entry.css;
				document.head.append(tag);
			}
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

		function formatTime(ms) {
			if (typeof ms !== "number" || !Number.isFinite(ms)) return "";
			const d = new Date(ms);
			const pad = (n) => String(n).padStart(2, "0");
			return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
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

		function DeleteChatPanel(props) {
			const close = props === undefined || props === null ? undefined : props.close;
			const [tab, setTab] = React.useState("archived");
			const [data, setData] = React.useState({ loading: true, error: null, sessions: [] });
			const [selected, setSelected] = React.useState({});
			const [confirm, setConfirm] = React.useState(null);
			const [busy, setBusy] = React.useState(false);
			const [notice, setNotice] = React.useState(null);

			const load = () => {
				setData({ loading: true, error: null, sessions: [] });
				deleteChatStore.inFlight = true;
				const request = apiDelete("list");
				deleteChatStore.promise = request;
				request.then((sessions) => {
					const data = { loading: false, error: null, sessions: Array.isArray(sessions) ? sessions : [], loadedAt: Date.now() };
					deleteChatStore.data = data;
					deleteChatStore.inFlight = false;
					deleteChatStore.promise = null;
					deleteChatStore.autoLoaded = true;
					setData(data);
				}, (err) => {
					const data = { loading: false, error: "加载失败: " + String((err && err.message) || err), sessions: [], loadedAt: Date.now() };
					deleteChatStore.data = data;
					deleteChatStore.inFlight = false;
					deleteChatStore.promise = null;
					deleteChatStore.autoLoaded = true;
					setData(data);
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
						let text = "删除完成：成功 " + okCount + " 个，失败 " + failed.length + " 个。";
						if (failed.length > 0) text += " 失败项：" + failed.map((r) => (r.title || r.id) + "（" + r.reason + "）").join("；");
						setNotice(text);
						setConfirm(null);
						setSelected({});
						setBusy(false);
						load();
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

			const renderBadges = (s) => [
				s.archived ? el("span", { className: "dsh-delchat-badge", key: "archived" }, "已归档") : null,
				s.live ? el("span", { className: "dsh-delchat-badge live", key: "live" }, "活跃") : null,
				s.persisted ? el("span", { className: "dsh-delchat-badge", key: "persisted" }, "已持久化") : null,
			];

			const renderRow = (s) => el("div", { className: "dsh-delchat-row", key: s.id },
				el("input", { type: "checkbox", checked: selected[s.id] === true, onChange: () => toggleSelected(s.id) }),
				el("span", { className: "dsh-delchat-title" }, s.title !== null && s.title !== undefined ? s.title : s.id),
				el("span", { className: "dsh-delchat-muted" }, formatTime(s.createdAt)),
				renderBadges(s),
				el("button", { className: "dsh-delchat-btn danger", disabled: busy, onClick: () => requestDelete([s]) }, "删除"),
			);

			const renderConfirm = () => {
				if (confirm === null) return null;
				const anyLive = confirm.targets.some((t) => t.live);
				const names = confirm.targets.map((t) => (t.title !== null && t.title !== undefined ? t.title : t.id)).join("、");
				const text = anyLive
					? "以下 " + confirm.targets.length + " 个会话中有活跃会话：" + names + "。删除后这些会话在本次运行内仍可继续对话，但新内容不再保存，程序重启后将彻底消失且不可恢复。确定删除？"
					: "确定删除以下 " + confirm.targets.length + " 个会话？删除后不可恢复：" + names;
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
						el("button", { className: "dsh-delchat-btn", disabled: busy, onClick: load }, "刷新"),
						el("span", { className: "dsh-delchat-muted" },
							data.loadedAt !== undefined && data.loadedAt !== null ? "上次加载 " + formatTime(data.loadedAt) : "",
						),
					),
					archived.length === 0
						? el("div", { className: "dsh-delchat-muted" }, "没有归档的会话。")
						: archived.map((s) => el("div", { className: "dsh-delchat-row", key: s.id },
							el("span", { className: "dsh-delchat-title" }, s.title !== null && s.title !== undefined ? s.title : s.id),
							el("span", { className: "dsh-delchat-muted" }, formatTime(s.createdAt)),
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
				return el("div", null,
					el("div", { className: "dsh-delchat-bar" },
						el("input", { type: "checkbox", checked: allSelected, onChange: toggleAll }),
						el("span", { className: "dsh-delchat-muted" }, "全选"),
						el("button", { className: "dsh-delchat-btn danger", disabled: selectedIds.length === 0 || busy, onClick: () => requestDelete(selectedTargets) }, "删除所选（" + selectedIds.length + "）"),
						el("button", { className: "dsh-delchat-btn", disabled: busy, onClick: load }, "刷新"),
					),
					sessions.map(renderRow),
					el("div", { className: "dsh-delchat-muted" }, "提示：删除后侧边栏中的条目会在页面刷新后消失。"),
					el("button", { className: "dsh-delchat-btn", onClick: () => window.location.reload() }, "刷新页面"),
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

			const load = React.useCallback(() => {
				setPhase("loading");
				setError(null);
				apiToggle("list").then((value) => {
					setPlugins(value.plugins ?? []);
					setPhase("ready");
				}, (err) => {
					setError(String((err && err.message) || err));
					setPhase("error");
				});
			}, []);

			React.useEffect(() => {
				load();
			}, [load]);

			const toggle = (p) => {
				if (busy !== null) return;
				setBusy(p.name);
				setNotice(null);
				apiToggle("set", { name: p.name, enabled: !p.enabled }).then((value) => {
					setBusy(null);
					setChanged(true);
					setNotice((value.enabled ? "已启用 " : "已停用 ") + p.name + "。重启 dsh web 后生效（可到「功能开关」页签顶部点击「重启 dsh web」）。");
					load();
				}, (err) => {
					setBusy(null);
					setNotice("操作失败：" + String((err && err.message) || err));
				});
			};

			// 重启入口统一在「功能开关」页签顶部的一键重启卡片（restart.web 常驻功能）。

			return el("div", { className: "pt" },
				el("div", { className: "pt-bar" },
					el("h3", { className: "pt-heading" }, "已安装的插件", el("span", null, phase === "ready" ? "（" + plugins.length + "）" : "")),
					el("button", { className: "pt-btn", disabled: phase === "loading" || busy !== null, onClick: load }, "刷新"),
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
							el("span", { className: "pt-name", title: p.name }, p.name),
							el("span", { className: "pt-meta" },
								"v" + p.version,
								p.isBundle ? " · bundle" : "",
								p.isBundle
									? (p.inBundles ? " · 已在 bundles 激活" : " · 未在 bundles 激活")
									: (p.inPatch ? " · 已有 patch 激活行" : " · 无 patch 激活行"),
							),
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
							el("span", { className: "pt-label" }, busy === p.name ? "处理中…" : (p.enabled ? "已启用" : "已停用")),
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
					className: "dsh-upd-btn",
					disabled: busy !== null,
					onClick: () => uninstallRow(p.name),
				}, state !== undefined && state.uninstalling === true ? "卸载中…" : "卸载");
			};

			const outdated = plugins.filter((p) => p.outdated === true);
			const skipped = plugins.filter((p) => p.skip === true);
			const fresh = plugins.filter((p) => p.outdated !== true && p.skip !== true);

			const renderRow = (p) => {
				const state = rows[p.name];
				if (p.outdated === true) {
					return el("div", { className: "dsh-upd-row", key: p.name },
						el("span", { className: "dsh-upd-name" }, p.name),
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
						el("span", { className: "dsh-upd-name" }, p.name),
						el("span", { className: "dsh-upd-skip" }, String(p.spec)),
						el("span", { className: "dsh-upd-skip" }, "本地/远程引用安装，不支持自动更新检查"),
						renderUninstall(p, state),
						state !== undefined && state.error !== undefined
							? el("span", { className: "dsh-upd-row-error" }, state.error)
							: null,
					);
				}
				return el("div", { className: "dsh-upd-row", key: p.name },
					el("span", { className: "dsh-upd-name" }, p.name),
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

		// --- settings page: 「dsh 工具箱」 ---

		function SettingsPage(props) {
			const close = props === undefined || props === null ? undefined : props.close;
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
			const optionalFeatures = features.filter((f) => f.alwaysOn !== true);
			const [notifyPerm, setNotifyPerm] = React.useState(undefined); // Notification.permission
			React.useEffect(() => {
				if (typeof window.Notification !== "undefined") setNotifyPerm(window.Notification.permission);
			}, []);

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
				setBusy(feature.key);
				setNotice(null);
				api("config/set", { key: feature.key, enabled: !feature.enabled }).then((snap) => {
					setConfig(snap);
					setBusy(null);
					const entry = (snap.features || []).find((f) => f.key === feature.key);
					setNotice(entry !== undefined && entry.enabled === true ? `已启用「${feature.label}」` : `已停用「${feature.label}」`);
					// The tab of a disabled feature disappears — land on 功能开关.
					if (entry !== undefined && entry.enabled !== true && activeTab === feature.key) setActiveTab("manage");
				}, (error) => {
					setBusy(null);
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

			const renderNotifyCard = () => el("div", { className: "dt-notify-card" },
				el("div", { className: "dt-restart-info" },
					el("span", { className: "dt-name" }, "桌面通知权限"),
					el("span", { className: "dt-meta" },
						notifyPerm === "granted"
							? "已授权：任务完成时在 Windows 屏幕右下角弹出系统提示框（置顶显示）"
							: notifyPerm === "denied"
								? "已被拒绝：提示回退为页面内提示框（需在浏览器站点设置中允许通知后刷新）"
								: notifyPerm === "default"
									? "未授权：点击右侧按钮授权，任务完成时在屏幕右下角弹出系统提示框"
									: "当前浏览器不支持系统桌面通知（提示回退为页面内提示框）",
					),
				),
				notifyPerm === "default" ? el("button", { type: "button", className: "dt-btn primary", onClick: requestNotifyPerm }, "授权桌面通知") : null,
			);

			const mergedPanels = {
				"delete-chat": { heading: "会话管理", component: DeleteChatPanel },
				"plugin-toggle": { heading: "插件开关", component: PluginTogglePanel },
				"update-plugin": { heading: "更新检查", component: UpdateCheckPanel },
			};

			const renderTabBody = () => {
				if (activeTab === "manage") {
					// Always-on cards first, then the toggle list of optional features.
					return [
						el("div", { key: "alwayson-restart" }, renderRestartCard()),
						el("div", { key: "alwayson-notify" }, renderNotifyCard()),
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
										el("span", { className: "dt-label" }, busy === feature.key ? "处理中…" : (feature.enabled ? "已启用" : "已停用")),
									),
								)),
							),
					];
				}
				const panel = mergedPanels[activeTab];
				if (panel !== undefined) {
					return el("div", { className: "dt-panel" },
						el("div", { className: "dt-panel-head" }, panel.heading),
						React.createElement(panel.component, { close }),
					);
				}
				return el("p", { className: "dt-muted" }, "该功能已停用或不可用。");
			};

			return el("div", { className: "dt-page" },
				el("div", { className: "dt-bar" },
					el("h3", { className: "dt-heading" }, "dsh 工具箱"),
				),
				el("p", { className: "dt-hint" }, "「功能开关」页签顶部为常驻功能（一键重启、桌面通知授权），下方为可选功能的开关。页签超出宽度时按住左右拖动查看。"),
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
		 * plus one tab per ENABLED OPTIONAL feature (alwaysOn features live
		 * inside 功能开关 and get no tab of their own). Exposed via
		 * __dshToolsTest so the Node smoke test can assert tab derivation
		 * without a DOM.
		 */
		function tabModel(cfg) {
			const tabs = [{ key: "manage", label: "功能开关" }];
			if (cfg !== null && cfg !== undefined) {
				for (const feature of cfg.features || []) {
					if (feature.alwaysOn === true) continue;
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
					const decision = evaluateTurnDone(msg, window.document.hasFocus(), currentRef.current, byIdRef.current);
					if (decision === null) return;
					// Preferred: a native Windows desktop notification — the page
					// is unfocused here, so an in-page toast would be invisible.
					// Windows renders it frontmost at the screen's bottom-right.
					const Notification = typeof window.Notification !== "undefined" ? window.Notification : undefined;
					if (Notification !== undefined && Notification.permission === "granted") {
						try {
							const payload = nativeNoticePayload(decision);
							const notice = new Notification(payload.title, { body: payload.body, tag: payload.tag });
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

		let ctx = undefined;

		function apply(pluginCtx) {
			ctx = pluginCtx;
			ctx.slots.inject("settings.section", () => ctx.slots.register(
				{ name: "settings.section", id: "dsh-tools", order: 35, label: "dsh 工具箱" },
				(props) => React.createElement(SettingsPage, { close: props === undefined || props === null ? undefined : props.close }),
			));
			ctx.slots.inject("shell.overlay", () => ctx.slots.register(
				{ name: "shell.overlay", id: "dsh-tools-notify", order: 100, label: "dsh-tools 任务完成提示" },
				(props) => React.createElement(NotifyOverlay, props),
			));
			return () => {
				ctx = undefined;
			};
		}

		exports.apply = apply;
		exports.inject = ["slots", "sessions"];
		exports.__dshToolsTest = { evaluateTurnDone, nativeNoticePayload, tabModel, updateCheckDecision, deleteChatLoadDecision };
		return module.exports;
	}
});
