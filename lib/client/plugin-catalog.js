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

