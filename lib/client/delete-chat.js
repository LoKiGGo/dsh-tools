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
				// v0.10：先请求不包含大小统计的快速列表，首屏立即渲染；
				// 再用完整列表在后台补齐磁盘占用，避免打开时长时间白屏。
				const request = apiDelete("list", { includeSizes: false });
				deleteChatStore.promise = request;
				request.then((sessions) => {
					const filtered = Array.isArray(sessions) ? sessions.filter((s) => !excludeIdsRef.current.has(s.id)) : [];
					const data = { loading: false, error: null, sessions: filtered, loadedAt: Date.now(), sizesPending: true };
					deleteChatStore.data = data;
					deleteChatStore.inFlight = false;
					deleteChatStore.promise = null;
					deleteChatStore.autoLoaded = true;
					setData(data);
					apiDelete("list", { includeSizes: true }).then((fullSessions) => {
						const fullFiltered = Array.isArray(fullSessions) ? fullSessions.filter((s) => !excludeIdsRef.current.has(s.id)) : [];
						const fullData = { loading: false, error: null, sessions: fullFiltered, loadedAt: Date.now(), sizesPending: false };
						deleteChatStore.data = fullData;
						setData(fullData);
					}, () => {
						// 大小补齐失败不阻塞使用：保留快速列表，只标记大小已停止更新。
						const current = deleteChatStore.data;
						if (current !== null && current !== undefined) {
							const next = Object.assign({}, current, { sizesPending: false });
							deleteChatStore.data = next;
							setData(next);
						}
					});
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
				el("span", { className: "dsh-delchat-muted dsh-delchat-size", title: "占用磁盘空间" }, data.sizesPending === true && (s.sizeBytes === null || s.sizeBytes === undefined) ? "计算中…" : formatBytes(s.sizeBytes)),
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
						data.sizesPending === true ? el("span", { className: "dsh-delchat-muted" }, "正在计算占用…") : null,
					),
					archived.length === 0
						? el("div", { className: "dsh-delchat-muted" }, "没有归档的会话。")
						: archived.map((s) => el("div", { className: "dsh-delchat-row", key: s.id },
							el("span", { className: "dsh-delchat-title" }, s.title !== null && s.title !== undefined ? s.title : s.id),
							el("span", { className: "dsh-delchat-muted" }, formatTime(s.createdAt)),
							el("span", { className: "dsh-delchat-muted dsh-delchat-size", title: "占用磁盘空间" }, data.sizesPending === true && (s.sizeBytes === null || s.sizeBytes === undefined) ? "计算中…" : formatBytes(s.sizeBytes)),
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
						data.sizesPending === true ? el("span", { className: "dsh-delchat-muted" }, "正在计算占用…") : null,
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

