		// --- 「界面增强」页签：历史条配置 + Markdown 渲染说明 ---

		function EnhancePanel() {
			const cfg = useConfig();
			const [notice, setNotice] = React.useState(null);
			const hc = featureConfigOf(cfg, "ui.enhance");
			const position = hc.historyPosition === "left" ? "left" : hc.historyPosition === "right" ? "right" : "off";
			const limit = typeof hc.historyLimit === "number" ? hc.historyLimit : 10;
			const [limitText, setLimitText] = React.useState(String(limit));
			React.useEffect(() => {
				setLimitText(String(typeof hc.historyLimit === "number" ? hc.historyLimit : 10));
			}, [cfg]);
			const markdownOn = hc.markdownEnabled !== false;

			const save = (patch) => {
				setNotice(null);
				setFeatureConfig("ui.enhance", Object.assign({}, hc, patch)).then(() => {
					setNotice("设置已保存");
				}, (error) => {
					setNotice("保存失败：" + String((error && error.message) || error));
				});
			};
			const saveLimit = () => {
				const parsed = Number(limitText);
				if (!Number.isFinite(parsed) || parsed < 0 || parsed > 500) {
					setNotice("回合数需为 0–500 的整数（0 = 显示全部）");
					setLimitText(String(limit));
					return;
				}
				save({ historyLimit: Math.floor(parsed) });
			};
			const posOptions = [
				{ id: "off", label: "关闭" },
				{ id: "right", label: "右侧" },
				{ id: "left", label: "左侧" },
			];

			return el("div", { className: "dt-panel" },
				el("div", { className: "dt-enh-row" },
					el("div", { className: "dt-enh-text" },
						el("span", { className: "dt-name" }, "浮动历史条"),
						el("span", { className: "dt-meta" }, "会话内容区边缘的历史记录条：悬停高亮、点击跳转对应回合。"),
					),
				),
				el("div", { className: "dt-enh-field" },
					el("span", { className: "dt-enh-label" }, "位置"),
					posOptions.map((option) => el("button", {
						key: option.id,
						type: "button",
						className: "dt-btn" + (position === option.id ? " primary" : ""),
						onClick: () => save({ historyPosition: option.id }),
					}, option.label)),
				),
				el("div", { className: "dt-enh-field" },
					el("span", { className: "dt-enh-label" }, "显示回合数"),
					el("input", {
						type: "number",
						className: "dt-enh-input",
						min: 0,
						max: 500,
						value: limitText,
						onChange: (event) => setLimitText(event.target.value),
						onBlur: saveLimit,
					}),
					el("span", { className: "dt-meta" }, "0 = 全部；悬挂的回合不受此限制"),
				),
				el("div", { className: "dt-enh-row" },
					el("div", { className: "dt-enh-text" },
						el("span", { className: "dt-name" }, "Markdown 渲染"),
						el("span", { className: "dt-meta" }, "用户消息按 Markdown 渲染（标题/列表/代码块/@引用），独立开关，随「界面增强」总开关一起生效。"),
					),
					el("button", {
						type: "button",
						role: "switch",
						"aria-checked": markdownOn ? "true" : "false",
						"aria-label": markdownOn ? "停用 Markdown 渲染" : "启用 Markdown 渲染",
						className: "dt-switch" + (markdownOn ? " on" : ""),
						onClick: () => save({ markdownEnabled: !markdownOn }),
					},
						el("span", { className: "dt-track" }, el("span", { className: "dt-thumb" })),
						el("span", { className: "dt-label" }, markdownOn ? "已启用" : "已停用"),
					),
				),
				notice !== null ? el("div", { className: "dt-notice", role: "status" }, notice) : null,
			);
		}

