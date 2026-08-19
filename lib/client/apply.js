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
		exports.__dshToolsTest = { evaluateTurnDone, nativeNoticePayload, tabModel, updateCheckDecision, harnessCheckDecision, deleteChatLoadDecision, groupSessionsByWorkspace, formatBytes, markdownNodeRegistration, historyRegistration, buildTurns, mergeVisibleTurns, decodeUsageRow, aggregateUsage, usageByBucket, usageModelKeys, formatTokens, formatDuration, rangeWindow, usageHitRate, estimateUsageCost, sessionUsageMetrics, formatPrice, formatBucketTooltip, UsagePanel, catalogFilter, catalogCounts, catalogModuleShortName, catalogTabRegistration, catalogFetchGate };
