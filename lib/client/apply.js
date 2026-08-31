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
		exports.__dshToolsTest = { evaluateTurnDone, nativeNoticePayload, tabModel, updateCheckDecision, harnessCheckDecision, deleteChatLoadDecision, groupSessionsByWorkspace, formatBytes, decodeUsageRow, aggregateUsage, usageByBucket, usageModelKeys, formatTokens, formatDuration, rangeWindow, usageHitRate, estimateUsageCost, sessionUsageMetrics, formatPrice, formatBucketTooltip, UsagePanel, catalogFilter, catalogCounts, catalogModuleShortName, catalogTabRegistration, catalogFetchGate };
