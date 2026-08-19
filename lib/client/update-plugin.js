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

