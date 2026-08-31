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
						setRestart({ phase: "done", waited: 0 });
						// v0.10: 重启流程会自动打开新的 dsh web 窗口，因此旧页面不再刷新，
						// 改为关闭本页；若浏览器不允许 window.close()，则提示用户手动关闭。
						try {
							const bridge = typeof window.dshDesktop !== "undefined" ? window.dshDesktop : undefined;
							if (bridge !== undefined && typeof bridge.closeWindow === "function") {
								bridge.closeWindow();
							}
						} catch {}
						try {
							window.close();
						} catch {}
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
							? ("服务重启中，新窗口将自动打开，本页即将关闭…（已等待 " + restart.waited + "s）")
							: restart.phase === "done"
								? "服务已重启，新窗口已打开；若本页未自动关闭，请手动关闭本页。"
								: restart.phase === "failed"
									? "未检测到服务恢复，请手动重启 dsh web。"
									: "重启服务并自动打开新窗口，本页会自动关闭——验证插件改动的最快方式",
					),
				),
				el("button", {
					type: "button",
					className: "dt-btn primary",
					disabled: restart.phase === "working",
					onClick: restart.phase === "done"
						? () => { try { window.close(); } catch {} }
						: doRestart,
				}, restart.phase === "working" ? "重启中…" : restart.phase === "done" ? "关闭本页" : "重启 dsh web"),
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

