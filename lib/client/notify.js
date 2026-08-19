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

