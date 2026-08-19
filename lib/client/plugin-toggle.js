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

