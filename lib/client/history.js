		// --- 浮动历史记录条（融合自 dsh-client-ui-custom，MIT © Yoli-mi） ---
		//
		// 会话内容区边缘的浮动历史条：每条竖线 = 一个用户回合，悬停波浪
		// 高亮、点击平滑滚动到对应消息；「悬挂」让某回合无视数量限制常驻。
		// 位置/数量/悬挂存 dsh-tools featureConfig（ui.enhance）。details
		// slot（priority -1）与 assistant-actions slot 随功能开关注册/注销。

		// --- turns 模型：Chat 快照 → 回合列表 + DOM 跳转 ---

		const HS_PREVIEW_LIMIT = 60;

		function hsBlockText(block) {
			if (block === null || typeof block !== "object") return null;
			const candidate = block;
			const isText = candidate.type === "text" || candidate.kind === "text";
			return isText && typeof candidate.text === "string" ? candidate.text : null;
		}

		function hsJoinPreview(chunks) {
			const text = chunks
				.map(hsBlockText)
				.filter((chunk) => chunk !== null)
				.join(" ")
				.replace(/\s+/g, " ")
				.trim();
			return text.length > HS_PREVIEW_LIMIT ? text.slice(0, HS_PREVIEW_LIMIT) + "…" : text;
		}

		function hsPreviewOfNode(kind, data) {
			if (data === null || typeof data !== "object") return "";
			const payload = data;
			if (kind === "user" || kind === "steering") {
				return Array.isArray(payload.content) ? hsJoinPreview(payload.content) : "";
			}
			if (kind === "assistant") {
				return Array.isArray(payload.blocks) ? hsJoinPreview(payload.blocks) : "";
			}
			return "";
		}

		function hsNodeTurn(node) {
			const location = node === null || node === undefined ? undefined : node.location;
			if (location === null || typeof location !== "object") return undefined;
			const loc = location;
			if (loc.kind !== "turn" && loc.kind !== "step") return undefined;
			const turn = loc.turn === null || loc.turn === undefined ? undefined : loc.turn.turn;
			return typeof turn === "number" ? turn : undefined;
		}

		/** Chat 快照 → 已挂载窗口内的用户回合列表（window 顺序）。 */
		function buildTurns(snapshot) {
			const turns = [];
			if (snapshot === null || snapshot === undefined || typeof snapshot !== "object") return turns;
			if (!Array.isArray(snapshot.order) || snapshot.nodes === undefined || typeof snapshot.nodes.get !== "function") return turns;
			for (const key of snapshot.order) {
				const node = snapshot.nodes.get(key);
				if (node === undefined) continue;
				if (node.kind !== "user" && node.kind !== "steering") continue;
				const turnNumber = hsNodeTurn(node);
				let time;
				if (turnNumber !== undefined && snapshot.legacy !== undefined && snapshot.legacy.turnTimings !== undefined && typeof snapshot.legacy.turnTimings.get === "function") {
					const timing = snapshot.legacy.turnTimings.get(turnNumber);
					time = timing === undefined || timing === null ? undefined : timing.startTime;
				}
				turns.push({
					key,
					index: turns.length + 1,
					question: hsPreviewOfNode(node.kind, node.data),
					time,
					turn: turnNumber,
				});
			}
			return turns;
		}

		/** 数量限制只作用于非悬挂回合，悬挂回合按自然位置并回。limit<=0 = 全部。 */
		function mergeVisibleTurns(turns, limit, pinned) {
			if (limit <= 0) return Array.isArray(turns) ? [...turns] : [];
			const pinnedTurns = turns.filter((turn) => turn.turn !== undefined && pinned.has(turn.turn));
			const rest = turns.filter((turn) => turn.turn === undefined || !pinned.has(turn.turn));
			return [...pinnedTurns, ...rest.slice(-limit)].sort((a, b) => a.index - b.index);
		}

		function hsFindAnchorRow(key) {
			const rows = document.querySelectorAll("[data-chat-anchor-key]");
			for (const row of rows) {
				if (row.dataset.chatAnchorKey === key) return row;
			}
			return null;
		}

		/** 平滑滚动到回合行并闪烁强调标记（行不在挂载窗口时 no-op）。 */
		function jumpToTurn(key) {
			const row = hsFindAnchorRow(key);
			if (row === null) return;
			row.scrollIntoView({ behavior: "smooth", block: "start" });
			const previousShadow = row.style.boxShadow;
			row.style.transition = "box-shadow 240ms ease";
			row.style.boxShadow = "inset 3px 0 0 0 var(--dsu-accent, var(--dsw-alias-brand-primary))";
			window.setTimeout(() => {
				row.style.boxShadow = previousShadow;
				row.style.transition = "";
			}, 1600);
		}

		/** 读者当前所在回合：最后一次滚过阅读偏移的回合行；否则最顶部一行。 */
		function currentTurnKey(keys) {
			const OFFSET = 120;
			const byKey = new Map();
			const rows = document.querySelectorAll("[data-chat-anchor-key]");
			for (const row of rows) {
				const key = row.dataset.chatAnchorKey;
				if (key !== undefined) byKey.set(key, row);
			}
			let current = null;
			let topmost = null;
			for (const key of keys) {
				const row = byKey.get(key);
				if (row === undefined) continue;
				const top = row.getBoundingClientRect().top;
				if (topmost === null || top < topmost.top) topmost = { key, top };
				if (top <= OFFSET) current = key;
			}
			return current === null ? (topmost === null ? null : topmost.key) : current;
		}

		const HS_WAVE_WIDTH = { 0: 100, 1: 62, 2: 40, 3: 24 };
		const HS_IDLE_CURRENT = 68;
		const HS_IDLE_REST = 34;
		const HS_STRIP_WIDTH = 60;
		const HS_EDGE_MARGIN = 12;
		const HS_TOOLTIP_GAP = 8;
		const HS_MAX_STRIP_TURNS = 120;
		const HS_THROTTLE_MS = 300;
		const HS_MAX_BATCHES = 24;

		function HistoryStrip(props) {
			const useSession = props === undefined || props === null ? undefined : props.useSession;
			const loadOlder = props === undefined || props === null ? undefined : props.loadOlder;
			const sessionId = props === undefined || props === null ? undefined : props.sessionId;
			const t = props === undefined || props === null ? undefined : props.t;
			const cfg = useConfig();
			const hc = featureConfigOf(cfg, "ui.enhance");
			const historyLimit = typeof hc.historyLimit === "number" ? hc.historyLimit : 10;
			const position = hc.historyPosition === "left" ? "left" : hc.historyPosition === "right" ? "right" : "off";

			const chat = useSession === undefined ? undefined : useSession((s) => s.chat);
			const blank = useSession === undefined ? true : useSession((s) => s.blank);
			const openState = useSession === undefined ? "closed" : useSession((s) => s.openState);
			const hasMore = useSession === undefined ? false : useSession((s) => s.hasMore);
			const loadingOlder = useSession === undefined ? false : useSession((s) => s.loadingOlder);

			const pinnedNumbers = React.useMemo(() => {
				const set = new Set();
				const record = hc.pinnedTurns === null || hc.pinnedTurns === undefined ? {} : hc.pinnedTurns;
				const list = typeof sessionId === "string" ? record[sessionId] : undefined;
				if (Array.isArray(list)) for (const turn of list) set.add(turn);
				return set;
			}, [hc, sessionId]);

			const allTurns = React.useMemo(
				() => (blank === true || position === "off" || chat === undefined) ? [] : buildTurns(chat),
				[chat, blank, position],
			);
			const turns = React.useMemo(
				() => mergeVisibleTurns(allTurns, historyLimit, pinnedNumbers),
				[allTurns, historyLimit, pinnedNumbers],
			);

			const [activeKey, setActiveKey] = React.useState(null);
			const [hovered, setHovered] = React.useState(null);
			const [tooltipY, setTooltipY] = React.useState(0);
			const loadOlderRef = React.useRef(loadOlder);
			loadOlderRef.current = loadOlder;
			const loadedBatches = React.useRef(0);

			const stripRef = React.useRef(null);
			const [conversationLeft, setConversationLeft] = React.useState(null);
			React.useLayoutEffect(() => {
				const el = stripRef.current;
				if (el === null) return undefined;
				let frame = el;
				while (frame !== null && frame.style.gridTemplateColumns === "") frame = frame.parentElement;
				if (frame === null) return undefined;
				const measure = () => {
					const sidebar = frame.children[0];
					if (sidebar === undefined) return;
					const width = sidebar.getBoundingClientRect().width;
					setConversationLeft((previous) => previous !== null && Math.abs(previous - width) <= 1 ? previous : width);
				};
				measure();
				const observer = new ResizeObserver(measure);
				observer.observe(frame);
				return () => observer.disconnect();
			}, [position, blank, turns.length === 0]);

			// 全量历史：节流分页往回加载，直到条上有足够回合（数量上限或视觉上限）。
			const target = historyLimit > 0 ? Math.min(historyLimit, HS_MAX_STRIP_TURNS) : HS_MAX_STRIP_TURNS;
			const unpinnedCount = React.useMemo(
				() => allTurns.filter((turn) => turn.turn === undefined || !pinnedNumbers.has(turn.turn)).length,
				[allTurns, pinnedNumbers],
			);
			const pinnedMissing = React.useMemo(() => {
				if (pinnedNumbers.size === 0) return false;
				const loaded = new Set();
				for (const turn of allTurns) if (turn.turn !== undefined) loaded.add(turn.turn);
				for (const turn of pinnedNumbers) if (!loaded.has(turn)) return true;
				return false;
			}, [allTurns, pinnedNumbers]);
			const pagerDone = unpinnedCount >= target && !pinnedMissing;
			React.useEffect(() => {
				if (position === "off") return undefined;
				if (openState !== "open" || !hasMore || loadingOlder) return undefined;
				if (pagerDone) return undefined;
				if (loadedBatches.current >= HS_MAX_BATCHES) return undefined;
				const timer = window.setTimeout(() => {
					loadedBatches.current += 1;
					if (typeof loadOlderRef.current === "function") loadOlderRef.current();
				}, HS_THROTTLE_MS);
				return () => window.clearTimeout(timer);
			}, [position, openState, hasMore, loadingOlder, pagerDone]);

			// 当前回合标记：滚动/缩放时 rAF 节流扫描。
			React.useEffect(() => {
				if (position === "off" || turns.length === 0) return undefined;
				let raf = 0;
				const keys = turns.map((turn) => turn.key);
				const compute = () => {
					raf = 0;
					setActiveKey(currentTurnKey(keys));
				};
				const onScroll = () => {
					if (raf === 0) raf = window.requestAnimationFrame(compute);
				};
				compute();
				document.addEventListener("scroll", onScroll, true);
				window.addEventListener("resize", onScroll);
				return () => {
					document.removeEventListener("scroll", onScroll, true);
					window.removeEventListener("resize", onScroll);
					if (raf !== 0) window.cancelAnimationFrame(raf);
				};
			}, [turns, position]);

			if (blank === true || turns.length === 0 || position === "off") return null;

			const clearHover = () => setHovered(null);
			const leftAnchor = (conversationLeft === null ? 0 : conversationLeft) + HS_EDGE_MARGIN;
			const stripStyle = { width: HS_STRIP_WIDTH };
			if (position === "left" && conversationLeft !== null) stripStyle.left = leftAnchor;

			return el("div", {
				ref: stripRef,
				className: "dt-hs-strip " + (position === "left" ? "dt-hs-stripLeft" : "dt-hs-stripRight"),
				style: stripStyle,
				onMouseLeave: clearHover,
			},
				hovered !== null ? ReactDom.createPortal(
					el("div", {
						className: "dt-hs-tooltip" + (position === "left" ? " dt-hs-tooltipLeft" : ""),
						style: {
							top: Math.max(48, Math.min(tooltipY, window.innerHeight - 48)),
							...(position === "left" && conversationLeft !== null
								? { left: leftAnchor + HS_STRIP_WIDTH + HS_TOOLTIP_GAP }
								: {}),
						},
						role: "tooltip",
					},
						el("span", { className: "dt-hs-tooltipDot", "aria-hidden": "true" }),
						el("span", { className: "dt-hs-tooltipText" }, (turns[hovered] === undefined ? "" : turns[hovered].question) || "无文本"),
					),
					document.body,
				) : null,
				turns.map((turn, index) => {
					const isActive = activeKey === turn.key;
					const isPinned = turn.turn !== undefined && pinnedNumbers.has(turn.turn);
					const width = hovered === null
						? (isActive ? HS_IDLE_CURRENT : HS_IDLE_REST)
						: (HS_WAVE_WIDTH[Math.min(3, Math.abs(index - hovered))] ?? HS_IDLE_REST);
					const level = hovered === null ? -1 : Math.min(3, Math.abs(index - hovered));
					const classes = ["dt-hs-bar"];
					if (isPinned) classes.push("dt-hs-barPinned");
					if (hovered !== null && level === 0) classes.push("dt-hs-barPeak");
					if (hovered !== null && level === 1) classes.push("dt-hs-barNear");
					if (hovered !== null && level === 2) classes.push("dt-hs-barFar");
					if (isActive) classes.push("dt-hs-barActive");
					return el("button", {
						key: turn.key,
						type: "button",
						className: classes.join(" "),
						style: { width: width + "%" },
						onMouseEnter: (event) => {
							setHovered(index);
							setTooltipY(event.currentTarget.getBoundingClientRect().top);
						},
						onClick: () => jumpToTurn(turn.key),
						"aria-label": "跳转到该回合",
					});
				}),
			);
		}

		// --- 悬挂（pin）：消息操作行的图钉按钮 ---

		function PinIcon(props) {
			const size = props === undefined || props === null ? undefined : props.size;
			return el("svg", {
				width: size === undefined ? 16 : size,
				height: size === undefined ? 16 : size,
				viewBox: "0 0 24 24",
				fill: "none",
				xmlns: "http://www.w3.org/2000/svg",
			},
				el("path", {
					fillRule: "evenodd",
					clipRule: "evenodd",
					d: "M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z",
					fill: "currentColor",
				}),
			);
		}

		function PinTurnAction(props) {
			const turn = props === undefined || props === null ? undefined : props.turn;
			const sessionId = props === undefined || props === null ? undefined : props.sessionId;
			const cfg = useConfig();
			const hc = featureConfigOf(cfg, "ui.enhance");
			const position = hc.historyPosition === "left" ? "left" : hc.historyPosition === "right" ? "right" : "off";
			const record = hc.pinnedTurns === null || hc.pinnedTurns === undefined ? {} : hc.pinnedTurns;
			const list = typeof sessionId === "string" ? record[sessionId] : undefined;
			const pinned = Array.isArray(list) && typeof turn === "number" && list.includes(turn);
			if (position === "off") return null;
			const label = pinned ? "取消悬挂" : "悬挂到历史条";
			const togglePin = () => {
				if (typeof turn !== "number" || typeof sessionId !== "string") return;
				const current = Array.isArray(list) ? list : [];
				const next = current.includes(turn) ? current.filter((n) => n !== turn) : [...current, turn].sort((a, b) => a - b);
				const updated = Object.assign({}, record);
				if (next.length === 0) delete updated[sessionId];
				else updated[sessionId] = next;
				setFeatureConfig("ui.enhance", Object.assign({}, hc, { pinnedTurns: updated }));
			};
			return el(Tooltip, { label, side: "bottom" },
				el("button", {
					type: "button",
					className: "dt-pin-action",
					"aria-label": label,
					"aria-pressed": pinned ? "true" : "false",
					"data-active": pinned ? "true" : undefined,
					onClick: togglePin,
				}, el(PinIcon, null)),
			);
		}

		/** ui.enhance 的注册门（历史条部分）：feature off 时注销 details/assistant-actions 条目。 */
		function historyRegistration(cfg) {
			if (cfg !== null && cfg !== undefined && cfg.features !== undefined && Array.isArray(cfg.features)) {
				const entry = cfg.features.find((f) => f.key === "ui.enhance");
				if (entry !== undefined && entry.enabled !== true) return false;
			}
			return true;
		}

