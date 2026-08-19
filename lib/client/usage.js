		// --- 应用用量统计（融合自 dsh-client-ui-custom，MIT © Yoli-mi） ---
		//
		// 纯客户端聚合：会话列表行已携带 Host 投影基线（projectionValues →
		// tokenUsage / sessionStats）+ updatedAt，无需额外 RPC。时间跨度与
		// 模型过滤决定聚合窗口；解码宽松，缺失/畸形投影按 0 计。

		const USAGE_RANGES = ["year", "month", "week", "days3"];
		const UG_DAY_MS = 86400000;

		function ugRangeStartMs(range, now) {
			switch (range) {
				case "year": return now - 365 * UG_DAY_MS;
				case "month": return now - 30 * UG_DAY_MS;
				case "week": return now - 7 * UG_DAY_MS;
				case "days3": return now - 3 * UG_DAY_MS;
			}
			return now - 7 * UG_DAY_MS;
		}

		function ugPad2(n) { return String(n).padStart(2, "0"); }

		function dateInputToMs(value) {
			if (typeof value !== "string") return NaN;
			const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
			if (m === null) return NaN;
			return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
		}

		function msToDateInput(ms) {
			if (typeof ms !== "number" || !Number.isFinite(ms)) return "";
			const d = new Date(ms);
			return d.getFullYear() + "-" + ugPad2(d.getMonth() + 1) + "-" + ugPad2(d.getDate());
		}

		function ugStartOfDay(ms) {
			const d = new Date(ms);
			return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
		}

		/** 统一时间窗口：preset 为相对窗口，custom 为绝对日期窗口（含结束日全天）。 */
		function rangeWindow(range, now) {
			if (range !== null && typeof range === "object" && range.mode === "custom") {
				const start = dateInputToMs(range.start);
				const end = dateInputToMs(range.end);
				if (!Number.isFinite(start) || !Number.isFinite(end)) return { start: now, end: now };
				const startMs = ugStartOfDay(start);
				const endMs = ugStartOfDay(end) + UG_DAY_MS - 1;
				return startMs <= endMs ? { start: startMs, end: endMs } : { start: endMs, end: startMs };
			}
			// 近 7 天 / 近 3 天按自然日对齐，避免柱状图跨两天（v0.10 修复）。
			if (range === "week" || range === "days3") {
				const count = range === "week" ? 7 : 3;
				return { start: ugStartOfDay(now - (count - 1) * UG_DAY_MS), end: ugStartOfDay(now) + UG_DAY_MS - 1 };
			}
			// 今年 / 本月按自然日历对齐。
			if (range === "year") {
				const d = new Date(now);
				return { start: new Date(d.getFullYear(), 0, 1).getTime(), end: ugStartOfDay(now) + UG_DAY_MS - 1 };
			}
			if (range === "month") {
				const d = new Date(now);
				return { start: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), end: ugStartOfDay(now) + UG_DAY_MS - 1 };
			}
			return { start: ugRangeStartMs(range, now), end: now };
		}

		function ugNum(value) {
			return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
		}

		/** 宽松解码一个会话行的投影值。 */
		function decodeUsageRow(updatedAt, projectionValues) {
			const usage = projectionValues === null || projectionValues === undefined ? undefined : projectionValues.tokenUsage;
			const stats = projectionValues === null || projectionValues === undefined ? undefined : projectionValues.sessionStats;
			const decodeBuckets = (value) => {
				if (value === null || typeof value !== "object") return null;
				return {
					uncachedInputTokens: ugNum(value.uncachedInputTokens),
					outputTokens: ugNum(value.outputTokens),
					cacheReadTokens: ugNum(value.cacheReadTokens),
					cacheWriteTokens: ugNum(value.cacheWriteTokens),
				};
			};
			const byModelRaw = usage !== null && typeof usage === "object" ? usage.byModel : undefined;
			let byModel = null;
			if (byModelRaw !== null && typeof byModelRaw === "object" && !Array.isArray(byModelRaw)) {
				byModel = {};
				for (const modelKey of Object.keys(byModelRaw)) {
					const decoded = decodeBuckets(byModelRaw[modelKey]);
					if (decoded !== null) byModel[modelKey] = decoded;
				}
				if (Object.keys(byModel).length === 0) byModel = null;
			}
			return {
				updatedAt,
				usage: decodeBuckets(usage),
				byModel,
				stats: stats === null || typeof stats !== "object"
					? null
					: {
						turns: ugNum(stats.turns),
						steps: ugNum(stats.steps),
						llmMs: ugNum(stats.llmMs),
						toolMs: ugNum(stats.toolMs),
					},
			};
		}

		function usageTokens(usage) {
			return usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens + usage.outputTokens;
		}

		/** 行的用量切片：模型过滤时取该模型的桶，否则取行总计；不可得为 null。 */
		function usageOfRow(row, modelKey) {
			if (modelKey === null) return row.usage;
			return row.byModel === null || row.byModel === undefined ? null : (row.byModel[modelKey] ?? null);
		}

		/** 模型选择器选项：`provider:model` 键，按首次出现顺序去重。 */
		function usageModelKeys(rows) {
			const keys = [];
			const seen = new Set();
			for (const row of rows) {
				if (row.byModel === null) continue;
				for (const modelKey of Object.keys(row.byModel)) {
					if (!seen.has(modelKey)) {
						seen.add(modelKey);
						keys.push(modelKey);
					}
				}
			}
			return keys;
		}

		function ugEmptyUsage() {
			return { sessions: 0, turns: 0, steps: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, llmMs: 0, toolMs: 0 };
		}

		/** 窗口内会话行聚合（模型过滤只计真正用过该模型的会话）。 */
		function aggregateUsage(rows, range, now, modelKey) {
			const win = rangeWindow(range, now);
			const total = ugEmptyUsage();
			for (const row of rows) {
				if (row.updatedAt < win.start || row.updatedAt > win.end) continue;
				const usage = usageOfRow(row, modelKey);
				if (modelKey !== null && usage === null) continue;
				total.sessions += row.sessions !== undefined && row.sessions !== null ? row.sessions : 1;
				if (row.stats !== null) {
					total.turns += row.stats.turns;
					total.steps += row.stats.steps;
					total.llmMs += row.stats.llmMs;
					total.toolMs += row.stats.toolMs;
				}
				if (usage !== null) {
					total.inputTokens += usage.uncachedInputTokens;
					total.outputTokens += usage.outputTokens;
					total.cacheReadTokens += usage.cacheReadTokens;
					total.cacheWriteTokens += usage.cacheWriteTokens;
				}
			}
			return total;
		}

		function ugEmptyModelBucket() {
			return { tokens: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
		}

		function ugEmptyBucket(start, end) {
			return { start, end, tokens: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, sessions: 0, hitRate: 0, byModel: {} };
		}

		function ugAddModelToBucket(bucket, modelKey, usage) {
			const model = bucket.byModel[modelKey] || ugEmptyModelBucket();
			model.tokens += usageTokens(usage);
			model.inputTokens += usage.uncachedInputTokens;
			model.outputTokens += usage.outputTokens;
			model.cacheReadTokens += usage.cacheReadTokens;
			model.cacheWriteTokens += usage.cacheWriteTokens;
			bucket.byModel[modelKey] = model;
		}

		function ugAddBucket(bucket, row, modelKey, sessions) {
			const usage = usageOfRow(row, modelKey);
			if (usage === null) return;
			bucket.tokens += usageTokens(usage);
			bucket.inputTokens += usage.uncachedInputTokens;
			bucket.outputTokens += usage.outputTokens;
			bucket.cacheReadTokens += usage.cacheReadTokens;
			bucket.cacheWriteTokens += usage.cacheWriteTokens;
			bucket.sessions += sessions;
			if (modelKey === null && row.byModel !== null) {
				for (const key of Object.keys(row.byModel)) {
					ugAddModelToBucket(bucket, key, row.byModel[key]);
				}
			} else {
				ugAddModelToBucket(bucket, modelKey === null ? "default" : modelKey, usage);
			}
		}

		function ugFinalizeBucket(bucket) {
			const denom = bucket.cacheReadTokens + bucket.inputTokens;
			bucket.hitRate = denom === 0 ? 0 : bucket.cacheReadTokens / denom;
			return bucket;
		}

		/** 趋势柱图桶：preset 保持原分桶；custom 按跨度自动天/周/月。 */
		function usageByBucket(rows, range, now, modelKey) {
			const win = rangeWindow(range, now);
			const isCustom = range !== null && typeof range === "object" && range.mode === "custom";
			let buckets = [];
			if (isCustom) {
				const spanDays = Math.round((win.end - win.start) / UG_DAY_MS) + 1;
				if (spanDays <= 31) {
					for (let cursor = ugStartOfDay(win.start); cursor <= win.end; cursor += UG_DAY_MS) {
						buckets.push(ugEmptyBucket(cursor, Math.min(cursor + UG_DAY_MS - 1, win.end)));
					}
				} else if (spanDays <= 92) {
					for (let cursor = ugStartOfDay(win.start); cursor <= win.end; cursor += 7 * UG_DAY_MS) {
						buckets.push(ugEmptyBucket(cursor, Math.min(cursor + 7 * UG_DAY_MS - 1, win.end)));
					}
				} else {
					const startDate = new Date(win.start);
					let y = startDate.getFullYear();
					let m = startDate.getMonth();
					while (true) {
						const monthStart = new Date(y, m, 1).getTime();
						if (monthStart > win.end) break;
						const monthEnd = new Date(y, m + 1, 1).getTime() - 1;
						buckets.push(ugEmptyBucket(Math.max(monthStart, win.start), Math.min(monthEnd, win.end)));
						m += 1;
						if (m > 11) { m = 0; y += 1; }
					}
				}
			} else if (range === "week" || range === "days3") {
				// 近 7 天 / 近 3 天按自然日分桶，每根柱子只代表一个日期。
				const count = range === "week" ? 7 : 3;
				const firstStart = ugStartOfDay(win.start);
				for (let index = 0; index < count; index++) {
					const start = firstStart + index * UG_DAY_MS;
					buckets.push(ugEmptyBucket(start, Math.min(start + UG_DAY_MS - 1, win.end)));
				}
			} else if (range === "year") {
				// 今年：按自然月分桶。
				const startDate = new Date(win.start);
				const year = startDate.getFullYear();
				for (let month = 0; month < 12; month++) {
					const monthStart = new Date(year, month, 1).getTime();
					if (monthStart > win.end) break;
					const monthEnd = new Date(year, month + 1, 1).getTime() - 1;
					buckets.push(ugEmptyBucket(Math.max(monthStart, win.start), Math.min(monthEnd, win.end)));
				}
			} else {
				// 本月：从月初开始按周分桶。
				let cursor = ugStartOfDay(win.start);
				while (cursor <= win.end) {
					buckets.push(ugEmptyBucket(cursor, Math.min(cursor + 7 * UG_DAY_MS - 1, win.end)));
					cursor += 7 * UG_DAY_MS;
				}
			}
			for (const row of rows) {
				if (row.updatedAt < win.start || row.updatedAt > win.end) continue;
				const usage = usageOfRow(row, modelKey);
				if (usage === null) continue;
				const bucket = buckets.find((b) => row.updatedAt >= b.start && row.updatedAt <= b.end);
				if (bucket !== undefined) ugAddBucket(bucket, row, modelKey, row.sessions !== undefined && row.sessions !== null ? row.sessions : 1);
			}
			return buckets.map(ugFinalizeBucket);
		}

		/** 紧凑 token 数（1.2k / 3.4M）。 */
		function formatTokens(count) {
			if (count >= 1000000) return (count / 1000000).toFixed(2) + "M";
			if (count >= 1000) return (count / 1000).toFixed(1) + "k";
			return String(count);
		}

		/** 紧凑时长（45s / 12m 30s / 3h 12m）。 */
		function formatDuration(ms) {
			const seconds = Math.round(ms / 1000);
			if (seconds < 60) return seconds + "s";
			const minutes = Math.floor(seconds / 60);
			if (minutes < 60) return minutes + "m " + (seconds % 60) + "s";
			const hours = Math.floor(minutes / 60);
			return hours + "h " + (minutes % 60) + "m";
		}

		function usageHitRate(usage) {
			if (usage === null || usage === undefined) return 0;
			const denom = usage.cacheReadTokens + usage.uncachedInputTokens;
			return denom === 0 ? 0 : usage.cacheReadTokens / denom;
		}

		// 默认官方价格表（DeepSeek API 文档，2026-08；单位：元 / 百万 tokens）。
		// 官方为峰谷分时定价，本插件无法按请求时间拆分，默认使用空闲时段价格，
		// 可在「价格配置」中切换 priceMode = peak 或修改具体数值。
		const UG_DEFAULT_PRICING = {
			"deepseek-v4-flash": {
				input: 1.5, cacheRead: 0.05, cacheWrite: 1.5, output: 4.5,
				peak: { input: 3.0, cacheRead: 0.10, cacheWrite: 3.0, output: 9.0 },
			},
			"deepseek-v4-pro": {
				input: 4.5, cacheRead: 0.15, cacheWrite: 4.5, output: 13.5,
				peak: { input: 9.0, cacheRead: 0.30, cacheWrite: 9.0, output: 27.0 },
			},
			"deepseek:deepseek-v4-flash": {
				input: 1.5, cacheRead: 0.05, cacheWrite: 1.5, output: 4.5,
				peak: { input: 3.0, cacheRead: 0.10, cacheWrite: 3.0, output: 9.0 },
			},
			"deepseek:deepseek-v4-pro": {
				input: 4.5, cacheRead: 0.15, cacheWrite: 4.5, output: 13.5,
				peak: { input: 9.0, cacheRead: 0.30, cacheWrite: 9.0, output: 27.0 },
			},
			// 无 byModel / 未知模型时按 DeepSeek V4 Flash 空闲时段估算，避免费用显示 0。
			"default": {
				input: 1.5, cacheRead: 0.05, cacheWrite: 1.5, output: 4.5,
				peak: { input: 3.0, cacheRead: 0.10, cacheWrite: 3.0, output: 9.0 },
			},
		};

		function usagePriceConfig(cfg) {
			if (cfg !== null && typeof cfg === "object" && cfg.pricing !== undefined && cfg.pricing !== null && typeof cfg.pricing === "object") {
				// 旧版保存的 pricing 可能没有 default 兜底；这里补上，避免费用显示 —。
				if (cfg.pricing.default === undefined) {
					return Object.assign({ default: UG_DEFAULT_PRICING.default }, cfg.pricing);
				}
				return cfg.pricing;
			}
			return UG_DEFAULT_PRICING;
		}

		function usagePriceMode(cfg) {
			return cfg !== null && typeof cfg === "object" && cfg.priceMode === "peak" ? "peak" : "offPeak";
		}

		function usagePriceFor(modelKey, cfg) {
			const table = usagePriceConfig(cfg);
			const mode = usagePriceMode(cfg);
			const pick = (entry) => {
				if (entry === null || typeof entry !== "object") return null;
				if (mode === "peak" && entry.peak !== null && typeof entry.peak === "object") return entry.peak;
				return entry;
			};
			const exact = table[modelKey] !== undefined ? pick(table[modelKey]) : null;
			if (exact !== null) return exact;
			const idx = String(modelKey).indexOf(":");
			const short = idx >= 0 ? String(modelKey).slice(idx + 1) : String(modelKey);
			if (table[short] !== undefined) return pick(table[short]);
			return table.default !== undefined ? pick(table.default) : null;
		}

		function usageCostOfBucket(usage, price) {
			if (usage === null || usage === undefined || price === null || price === undefined) return null;
			const input = ugNum(usage.uncachedInputTokens) * (typeof price.input === "number" ? price.input : 0);
			const cacheRead = ugNum(usage.cacheReadTokens) * (typeof price.cacheRead === "number" ? price.cacheRead : 0);
			const cacheWrite = ugNum(usage.cacheWriteTokens) * (typeof price.cacheWrite === "number" ? price.cacheWrite : (typeof price.input === "number" ? price.input : 0));
			const output = ugNum(usage.outputTokens) * (typeof price.output === "number" ? price.output : 0);
			return (input + cacheRead + cacheWrite + output) / 1000000;
		}

		function estimateUsageCost(row, modelKey, cfg) {
			if (modelKey !== null) {
				const usage = usageOfRow(row, modelKey);
				if (usage === null) return null;
				return usageCostOfBucket(usage, usagePriceFor(modelKey, cfg));
			}
			if (row.byModel !== null) {
				let total = 0;
				let any = false;
				for (const key of Object.keys(row.byModel)) {
					const price = usagePriceFor(key, cfg);
					if (price === null) continue;
					const cost = usageCostOfBucket(row.byModel[key], price);
					if (cost !== null) { total += cost; any = true; }
				}
				return any ? total : null;
			}
			return usageCostOfBucket(row.usage, usagePriceFor("default", cfg));
		}

		function sessionUsageMetrics(row, modelKey, cfg) {
			const usage = usageOfRow(row, modelKey);
			return {
				tokens: usage === null ? 0 : usageTokens(usage),
				hitRate: usage === null ? 0 : usageHitRate(usage),
				cost: estimateUsageCost(row, modelKey, cfg),
				missing: modelKey !== null && usage === null,
			};
		}

		function formatPrice(value) {
			if (value === null || value === undefined || !Number.isFinite(value)) return "—";
			if (value === 0) return "¥0.00";
			if (value < 0.01) return "¥" + value.toFixed(4);
			return "¥" + value.toFixed(2);
		}

		function formatBucketDateRange(start, end) {
			const s = new Date(start);
			const e = new Date(end);
			const sameDay = s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth() && s.getDate() === e.getDate();
			if (sameDay) return s.getFullYear() + "-" + ugPad2(s.getMonth() + 1) + "-" + ugPad2(s.getDate());
			if (s.getFullYear() === e.getFullYear()) return (s.getMonth() + 1) + "月" + s.getDate() + "日 - " + (e.getMonth() + 1) + "月" + e.getDate() + "日";
			return s.getFullYear() + "-" + (s.getMonth() + 1) + "-" + s.getDate() + " - " + e.getFullYear() + "-" + (e.getMonth() + 1) + "-" + e.getDate();
		}

		function bucketCost(bucket, cfg) {
			const row = {
				usage: {
					uncachedInputTokens: bucket.inputTokens,
					outputTokens: bucket.outputTokens,
					cacheReadTokens: bucket.cacheReadTokens,
					cacheWriteTokens: bucket.cacheWriteTokens,
				},
				byModel: bucket.byModel !== undefined && Object.keys(bucket.byModel).length > 0 ? bucket.byModel : null,
			};
			return estimateUsageCost(row, null, cfg);
		}

		function formatBucketTooltip(bucket, cfg) {
			const cost = bucketCost(bucket, cfg);
			const rows = [
				["日期", formatBucketDateRange(bucket.start, bucket.end)],
				["总 Token", formatTokens(bucket.tokens)],
				["输入", formatTokens(bucket.inputTokens)],
				["输出", formatTokens(bucket.outputTokens)],
				["缓存读", formatTokens(bucket.cacheReadTokens)],
				["会话数", String(bucket.sessions)],
				["命中率", (bucket.hitRate * 100).toFixed(1) + "%"],
				["费用", formatPrice(cost)],
			];
			return rows.map((row) => row[0] + "：" + row[1]).join("\n");
		}

		const UG_RANGE_LABELS = { year: "今年", month: "本月", week: "近 7 天", days3: "近 3 天", custom: "自定义" };

		function UsagePanel(props) {
			// settings.section runtime prop 注入的标准 useSessions 选择器 hook
			// （v0.7.0 实测：ctx.sessions.list 是 SnapshotStore 对象而非 hook，
			// 直接调用恒为 undefined → 面板永远空数据）。
			const useSessions = props === undefined || props === null ? undefined : props.useSessions;
			const list = typeof useSessions === "function" ? useSessions((value) => value) : { byId: {} };
			const cfg = useConfig();
			const usageCfg = featureConfigOf(cfg, "ui.usage");
			const [range, setRange] = React.useState("week");
			const [modelKey, setModelKey] = React.useState(null);
			const [hoverIndex, setHoverIndex] = React.useState(null);
			const [customStart, setCustomStart] = React.useState("");
			const [customEnd, setCustomEnd] = React.useState("");
			const [showAll, setShowAll] = React.useState(false);
			const [priceOpen, setPriceOpen] = React.useState(false);
			const [priceText, setPriceText] = React.useState("");
			const [priceError, setPriceError] = React.useState("");
			const [priceSaving, setPriceSaving] = React.useState(false);
			const [daily, setDaily] = React.useState(null);
			const [dailyLoading, setDailyLoading] = React.useState(true);
			React.useEffect(() => {
				let alive = true;
				api("usage/daily").then((value) => {
					if (alive) {
						setDaily(value !== null && typeof value === "object" && value.days !== undefined && value.days !== null ? value : null);
						setDailyLoading(false);
					}
				}, () => {
					if (alive) {
						setDaily(null);
						setDailyLoading(false);
					}
				});
				return () => { alive = false; };
			}, []);
			const byId = list === undefined || list === null || list.byId === undefined ? {} : list.byId;
			const now = Date.now();
			const rawSessionRows = Object.keys(byId).map((id) => decodeUsageRow(byId[id].updatedAt, byId[id].projectionValues));
			const dailyRows = daily !== null && daily.days !== undefined && daily.days !== null
				? Object.keys(daily.days).sort().map((date) => {
					const day = daily.days[date];
					const byModel = day.byModel !== undefined && day.byModel !== null && typeof day.byModel === "object"
						? Object.keys(day.byModel).reduce((acc, modelKey) => {
							const model = day.byModel[modelKey];
							acc[modelKey] = {
								uncachedInputTokens: model.inputTokens || 0,
								outputTokens: model.outputTokens || 0,
								cacheReadTokens: model.cacheReadTokens || 0,
								cacheWriteTokens: model.cacheWriteTokens || 0,
							};
							return acc;
						}, {})
						: null;
					return {
						updatedAt: dateInputToMs(date),
						usage: {
							uncachedInputTokens: day.inputTokens || 0,
							outputTokens: day.outputTokens || 0,
							cacheReadTokens: day.cacheReadTokens || 0,
							cacheWriteTokens: day.cacheWriteTokens || 0,
						},
						byModel,
						stats: null,
						sessions: day.sessions || 1,
					};
				})
				: [];
			const useDailyRows = dailyRows.length > 0;
			const rows = useDailyRows ? dailyRows : rawSessionRows;
			const modelKeys = usageModelKeys(rows);
			const activeModel = modelKey !== null && modelKeys.includes(modelKey) ? modelKey : null;
			const win = rangeWindow(range, now);
			const sessionTotal = aggregateUsage(rawSessionRows, range, now, activeModel);
			const tokenTotal = aggregateUsage(rows, range, now, activeModel);
			const total = useDailyRows ? tokenTotal : sessionTotal;
			const buckets = usageByBucket(rows, range, now, activeModel);
			const hoverBucket = hoverIndex === null ? null : buckets[hoverIndex];
			const maxTokens = Math.max(1, ...buckets.map((bucket) => bucket.tokens));
			const barHeightPct = (tokens) => {
				const ratio = maxTokens === 0 ? 0 : tokens / maxTokens;
				return Math.round(Math.pow(ratio, 1.5) * 100);
			};
			const hitTokens = total.cacheReadTokens + total.inputTokens;
			const hitRate = hitTokens === 0 ? 0 : total.cacheReadTokens / hitTokens;

			const bucketLabel = (start) => {
				const date = new Date(start);
				if (range === "year") return date.toLocaleDateString(undefined, { month: "short" });
				return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
			};
			const modelLabel = (modelKeyText) => modelKeyText.replace(":", " / ");

			const sessionRows = Object.keys(byId)
				.map((id) => {
					const summary = byId[id];
					const row = decodeUsageRow(summary.updatedAt, summary.projectionValues);
					const metrics = sessionUsageMetrics(row, activeModel, usageCfg);
					return {
						id,
						title: summary.displayTitle,
						updatedAt: summary.updatedAt,
						tokens: metrics.tokens,
						hitRate: metrics.hitRate,
						cost: metrics.cost,
						missing: metrics.missing,
					};
				})
				.filter((entry) => !entry.missing && entry.updatedAt >= win.start && entry.updatedAt <= win.end)
				.sort((a, b) => b.tokens - a.tokens);
			const visibleSessions = showAll ? sessionRows : sessionRows.slice(0, 5);
			const knownCosts = useDailyRows
				? dailyRows
					.filter((row) => row.updatedAt >= win.start && row.updatedAt <= win.end)
					.map((row) => estimateUsageCost(row, activeModel, usageCfg))
					.filter((cost) => cost !== null && cost !== undefined)
				: sessionRows.map((entry) => entry.cost).filter((cost) => cost !== null && cost !== undefined);
			const totalCost = knownCosts.length === 0 ? null : knownCosts.reduce((sum, cost) => sum + cost, 0);
			const empty = total.sessions === 0 && total.inputTokens === 0 && total.outputTokens === 0;
			const chartLoading = dailyLoading && rawSessionRows.length === 0;

			const applyCustom = () => {
				if (!customStart || !customEnd || customStart > customEnd) return;
				const next = { mode: "custom", start: customStart, end: customEnd };
				setRange(next);
				const c = featureConfigOf(cfg, "ui.usage");
				setFeatureConfig("ui.usage", Object.assign({}, c, { customStart, customEnd })).catch(() => {});
			};
			const clearCustom = () => {
				setCustomStart("");
				setCustomEnd("");
				setRange("week");
			};
			const openCustom = () => {
				const c = featureConfigOf(cfg, "ui.usage");
				const start = c.customStart || msToDateInput(now - 7 * UG_DAY_MS);
				const end = c.customEnd || msToDateInput(now);
				setCustomStart(start);
				setCustomEnd(end);
				setRange({ mode: "custom", start, end });
			};
			const togglePrice = () => {
				if (!priceOpen) {
					const c = featureConfigOf(cfg, "ui.usage");
					setPriceText(JSON.stringify({ pricing: c.pricing && typeof c.pricing === "object" ? c.pricing : UG_DEFAULT_PRICING, priceMode: c.priceMode || "offPeak" }, null, 2));
					setPriceError("");
				}
				setPriceOpen(!priceOpen);
			};
			const savePrice = async () => {
				setPriceError("");
				let parsed;
				try {
					parsed = JSON.parse(priceText);
				} catch (error) {
					setPriceError("JSON 格式错误：" + String((error && error.message) || error));
					return;
				}
				const c = featureConfigOf(cfg, "ui.usage");
				const next = Object.assign({}, c, {
					pricing: parsed !== null && typeof parsed === "object" && parsed.pricing !== undefined && parsed.pricing !== null && typeof parsed.pricing === "object"
						? parsed.pricing
						: (parsed !== null && typeof parsed === "object" ? parsed : UG_DEFAULT_PRICING),
					priceMode: parsed !== null && typeof parsed === "object" && parsed.priceMode === "peak" ? "peak" : "offPeak",
				});
				setPriceSaving(true);
				try {
					await setFeatureConfig("ui.usage", next);
				} catch (error) {
					setPriceError(String((error && error.message) || error));
				} finally {
					setPriceSaving(false);
				}
			};
			const resetPrice = () => {
				const c = featureConfigOf(cfg, "ui.usage");
				const next = Object.assign({}, c, { pricing: UG_DEFAULT_PRICING, priceMode: "offPeak" });
				setPriceText(JSON.stringify({ pricing: UG_DEFAULT_PRICING, priceMode: "offPeak" }, null, 2));
				setPriceError("");
				setFeatureConfig("ui.usage", next).catch((error) => setPriceError(String((error && error.message) || error)));
			};

			const isCustom = typeof range === "object" && range.mode === "custom";

			return el("div", { className: "dt-ug-section" },
				el("div", { className: "dt-ug-toolbar" },
					el("div", { className: "dt-ug-tabs", role: "tablist", "aria-label": "用量时间范围" },
						USAGE_RANGES.concat(["custom"]).map((id) => el("button", {
							key: id,
							type: "button",
							role: "tab",
							"aria-selected": (isCustom ? id === "custom" : id === range) ? "true" : "false",
							className: (isCustom ? id === "custom" : id === range) ? "dt-ug-tab dt-ug-tabActive" : "dt-ug-tab",
							onClick: () => { if (id === "custom") openCustom(); else setRange(id); },
						}, UG_RANGE_LABELS[id])),
					),
					modelKeys.length > 0 ? el("select", {
						className: "dt-ug-model",
						value: activeModel === null ? "" : activeModel,
						onChange: (event) => setModelKey(event.target.value === "" ? null : event.target.value),
						"aria-label": "模型过滤",
					},
						el("option", { value: "", key: "" }, "全部模型"),
						modelKeys.map((key) => el("option", { value: key, key }, modelLabel(key))),
					) : null,
				),
				isCustom ? el("div", { className: "dt-ug-custom" },
					el("input", { type: "date", className: "dt-ug-dateInput", value: customStart, onChange: (event) => setCustomStart(event.target.value), "aria-label": "自定义开始日期" }),
					el("span", { className: "dt-ug-totalCost" }, "至"),
					el("input", { type: "date", className: "dt-ug-dateInput", value: customEnd, onChange: (event) => setCustomEnd(event.target.value), "aria-label": "自定义结束日期" }),
					el("button", { type: "button", className: "dt-ug-btn", disabled: !customStart || !customEnd || customStart > customEnd, onClick: applyCustom }, "应用"),
					el("button", { type: "button", className: "dt-ug-btn", onClick: clearCustom }, "清除"),
				) : null,
				(empty || chartLoading) ? el("p", { className: "dt-ug-empty" }, chartLoading ? "正在加载用量数据…" : "所选范围内暂无用量数据。") : el("div", { className: "dt-ug-section" },
					el("div", { className: "dt-ug-kpis" },
						el("div", { className: "dt-ug-kpi" },
							el("span", { className: "dt-ug-kpiLabel" }, "总量"),
							el("span", { className: "dt-ug-kpiValue" }, formatTokens(total.inputTokens + total.outputTokens + total.cacheReadTokens + total.cacheWriteTokens)),
						),
						el("div", { className: "dt-ug-kpi" },
							el("span", { className: "dt-ug-kpiLabel" }, "输入"),
							el("span", { className: "dt-ug-kpiValue" }, formatTokens(total.inputTokens)),
							el("span", { className: "dt-ug-kpiSub" }, formatTokens(total.cacheWriteTokens) + " write"),
						),
						el("div", { className: "dt-ug-kpi" },
							el("span", { className: "dt-ug-kpiLabel" }, "输出"),
							el("span", { className: "dt-ug-kpiValue" }, formatTokens(total.outputTokens)),
						),
						el("div", { className: "dt-ug-kpi" },
							el("span", { className: "dt-ug-kpiLabel" }, "缓存"),
							el("span", { className: "dt-ug-kpiValue" }, formatTokens(total.cacheReadTokens)),
							el("span", { className: "dt-ug-kpiSub" }, "命中率 " + (hitRate * 100).toFixed(1) + "%"),
						),
						el("div", { className: "dt-ug-kpi" },
							el("span", { className: "dt-ug-kpiLabel" }, "费用"),
							el("span", { className: "dt-ug-kpiValue" }, formatPrice(totalCost)),
							el("span", { className: "dt-ug-kpiSub" }, "估算"),
						),
						el("div", { className: "dt-ug-kpi" },
							el("span", { className: "dt-ug-kpiLabel" }, "时长"),
							el("span", { className: "dt-ug-kpiValue" }, formatDuration(sessionTotal.llmMs)),
							el("span", { className: "dt-ug-kpiSub" }, formatDuration(sessionTotal.toolMs) + " tool"),
						),
						el("div", { className: "dt-ug-kpi" },
							el("span", { className: "dt-ug-kpiLabel" }, "会话"),
							el("span", { className: "dt-ug-kpiValue" }, String(sessionTotal.sessions)),
							el("span", { className: "dt-ug-kpiSub" }, "步数 " + sessionTotal.steps),
						),
					),
					el("div", { className: "dt-ug-breakdown" },
						el("span", { className: "dt-ug-breakdownLabel" }, "用量趋势"),
						el("div", { className: "dt-ug-bars" },
							hoverBucket !== null ? el("div", {
								className: "dt-ug-tooltip",
								style: {
									left: ((hoverIndex + 0.5) / buckets.length * 100) + "%",
									bottom: "100%",
									transform: "translateX(-50%)",
									marginBottom: "6px",
								},
							},
								el("div", { className: "dt-ug-tooltipTitle" }, formatBucketDateRange(hoverBucket.start, hoverBucket.end)),
								el("div", { className: "dt-ug-tooltipRow" }, el("span", { className: "dt-ug-tooltipLabel" }, "总 Token"), el("span", { className: "dt-ug-tooltipValue" }, formatTokens(hoverBucket.tokens))),
								el("div", { className: "dt-ug-tooltipRow" }, el("span", { className: "dt-ug-tooltipLabel" }, "输入"), el("span", { className: "dt-ug-tooltipValue" }, formatTokens(hoverBucket.inputTokens))),
								el("div", { className: "dt-ug-tooltipRow" }, el("span", { className: "dt-ug-tooltipLabel" }, "输出"), el("span", { className: "dt-ug-tooltipValue" }, formatTokens(hoverBucket.outputTokens))),
								el("div", { className: "dt-ug-tooltipRow" }, el("span", { className: "dt-ug-tooltipLabel" }, "缓存读"), el("span", { className: "dt-ug-tooltipValue" }, formatTokens(hoverBucket.cacheReadTokens))),
								el("div", { className: "dt-ug-tooltipRow" }, el("span", { className: "dt-ug-tooltipLabel" }, "会话数"), el("span", { className: "dt-ug-tooltipValue" }, String(hoverBucket.sessions))),
								el("div", { className: "dt-ug-tooltipRow" }, el("span", { className: "dt-ug-tooltipLabel" }, "命中率"), el("span", { className: "dt-ug-tooltipValue" }, (hoverBucket.hitRate * 100).toFixed(1) + "%")),
								el("div", { className: "dt-ug-tooltipRow" }, el("span", { className: "dt-ug-tooltipLabel" }, "费用"), el("span", { className: "dt-ug-tooltipValue" }, formatPrice(bucketCost(hoverBucket, usageCfg)))),
							) : null,
							buckets.map((bucket, index) => {
								const heightPct = barHeightPct(bucket.tokens);
								return el("div", {
									key: bucket.start,
									className: "dt-ug-barWrap",
									tabIndex: 0,
									onMouseEnter: () => setHoverIndex(index),
									onMouseLeave: () => setHoverIndex(null),
									onFocus: () => setHoverIndex(index),
									onBlur: () => setHoverIndex(null),
									"aria-label": formatBucketTooltip(bucket, usageCfg),
								},
									el("div", { className: "dt-ug-bar", style: { height: heightPct + "%" } }),
									el("span", { className: "dt-ug-barLabel" }, bucketLabel(bucket.start)),
								);
							}),
						),
					),
					sessionRows.length > 0 ? el("div", { className: "dt-ug-breakdown" },
						el("span", { className: "dt-ug-breakdownLabel" }, "会话用量"),
						el("div", { className: "dt-ug-sessionTable" },
							el("div", { className: "dt-ug-sessionHead" },
								el("span", {}, "会话"),
								el("span", { className: "dt-ug-sessionNum" }, "Token"),
								el("span", { className: "dt-ug-sessionNum" }, "命中率"),
								el("span", { className: "dt-ug-sessionNum" }, "费用"),
							),
							visibleSessions.map((entry) => el("div", { key: entry.id, className: "dt-ug-sessionRow" },
								el("span", { className: "dt-ug-sessionTitle", title: entry.title }, entry.title),
								el("span", { className: "dt-ug-sessionNum" }, formatTokens(entry.tokens)),
								el("span", { className: "dt-ug-sessionNum" }, (entry.hitRate * 100).toFixed(1) + "%"),
								el("span", { className: "dt-ug-sessionNum" }, formatPrice(entry.cost)),
							)),
						),
						sessionRows.length > 5 ? el("button", { type: "button", className: "dt-ug-expandBtn", onClick: () => setShowAll(!showAll) }, showAll ? "收起" : "展开全部（" + sessionRows.length + "）") : null,
					) : null,
					el("div", { className: "dt-ug-priceConfig" },
						el("button", { type: "button", className: "dt-ug-expandBtn", onClick: togglePrice }, priceOpen ? "收起价格配置" : "价格配置"),
						priceOpen ? el("div", { className: "dt-ug-priceConfig" },
							el("textarea", { className: "dt-ug-priceTextarea", value: priceText, onChange: (event) => setPriceText(event.target.value), spellCheck: false, "aria-label": "价格配置 JSON" }),
							priceError !== "" ? el("div", { className: "dt-ug-priceError" }, priceError) : null,
							el("div", { className: "dt-ug-priceHint" }, "价格单位：元 / 百万 tokens。默认按空闲时段估算；JSON 中可把 priceMode 改为 peak 使用高峰价格。"),
							el("div", { className: "dt-ug-custom" },
								el("button", { type: "button", className: "dt-ug-btn", disabled: priceSaving, onClick: savePrice }, priceSaving ? "保存中…" : "保存价格"),
								el("button", { type: "button", className: "dt-ug-btn", onClick: resetPrice }, "恢复默认"),
							),
						) : null,
					),
					el("p", { className: "dt-ug-note" }, "数据仅供参考，与真实数据有少量差异。"),
				),
			);
		}

		let ctx = undefined;

