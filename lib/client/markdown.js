		// --- 用户消息 Markdown 渲染（融合自 dsh-client-ui-custom，MIT © Yoli-mi） ---
		//
		// keyed slot `conversation.chat.node` 以 priority -1 覆盖 user / steering
		// 单元格的默认渲染：开启 ui.enhance 时用户消息气泡文本走 MarkdownText，
		// 关闭时回退原生渲染，外观与原生一致。
		// 平台原子（MarkdownText / MessageText / JsonBlock / Tooltip / 图标 /
		// writeClipboard / ImageGallery）来自 shell 静态表；气泡几何从
		// ui-conversation 的 MessageItem 复刻，保持视觉与原生一致。

		/**
		 * 保护用户消息里的 @文件引用 边界。
		 * 例如 `@plan.txt先写计划书` 会被 Markdown/mention 识别成同一个超长 token，
		 * 导致 plan.txt 后面的文字也被高亮。这里在文件类 @token 后插入 hair space
		 * （U+200A，属于 \s 但视觉几乎不可见），让高亮只覆盖文件名/引用本身。
		 */
		function protectReferenceBoundaries(text) {
			if (typeof text !== "string") return text;
			return text.replace(/(?:@[A-Za-z0-9_.\/-]+)/g, (match, offset, whole) => {
				const next = whole[offset + match.length];
				// 只在后面紧跟 CJK/日韩文字时插入 hair space，避免在逗号等标点前也产生空隙。
				const needsBoundary = next !== undefined && /[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(next);
				return needsBoundary ? match + "\u200A" : match;
			});
		}

		function markdownNodeRegistration(cfg) {
			if (cfg !== null && cfg !== undefined && cfg.features !== undefined && Array.isArray(cfg.features)) {
				const entry = cfg.features.find((f) => f.key === "ui.enhance");
				if (entry !== undefined && entry.enabled !== true) return false;
			}
			// v0.10：Markdown 渲染拥有独立开关，默认开启（featureConfig 未到达时乐观开启）。
			const enhanceCfg = featureConfigOf(cfg, "ui.enhance");
			if (enhanceCfg.markdownEnabled === false) return false;
			return true; // config 未到达时乐观注册
		}

		function UserMarkdownNodeView(props) {
			const node = props === undefined || props === null ? undefined : props.node;
			const loadImage = props === undefined || props === null ? undefined : props.loadImage;
			const t = props === undefined || props === null ? undefined : props.t;
			const data = node === undefined || node === null ? undefined : node.data;
			if (data === undefined) return null;
			const content = data.content;
			const text = [];
			const images = [];
			const rest = [];
			for (const block of content) {
				const b = block;
				if (b !== null && typeof b === "object" && b.type === "text" && typeof b.text === "string") text.push(b.text);
				else if (b !== null && typeof b === "object" && b.type === "image" && b.attachment !== undefined) images.push({ attachment: b.attachment });
				else rest.push(block);
			}
			const textJoined = text.join("");
			const showBubble = textJoined !== "" || rest.length > 0;
			const pad2 = (n) => String(n).padStart(2, "0");
			const clockText = () => {
				const time = data.time;
				if (typeof time !== "number") return null;
				const d = new Date(time);
				const n = new Date(Date.now());
				const clock = pad2(d.getHours()) + ":" + pad2(d.getMinutes());
				if (d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()) return clock;
				const md = d.getFullYear() === n.getFullYear() ? (d.getMonth() + 1) + "/" + d.getDate() : d.getFullYear() + "/" + (d.getMonth() + 1) + "/" + d.getDate();
				return md + " " + clock;
			};
			const [copied, setCopied] = React.useState(false);
			const onCopy = () => {
				UiPrimitives.writeClipboard(textJoined).then((ok) => {
					if (!ok) return;
					setCopied(true);
					window.setTimeout(() => setCopied(false), 1000);
				});
			};
			const labels = (() => {
				if (t === undefined || typeof t !== "function") return undefined;
				return {
					image: t("image.label"),
					open: t("image.openOriginal"),
					openNamed: (label) => t("image.openOriginalLabel", { label }),
					loading: t("image.loading"),
					loadFailed: t("image.loadFailed"),
					lightbox: { dialog: t("image.preview"), close: t("image.closePreview") },
				};
			})();
			const copyLabel = t !== undefined && typeof t === "function" ? t("copy") : "复制";
			const copiedLabel = t !== undefined && typeof t === "function" ? t("copied") : "已复制";
			const truncatedLabel = (total) => t !== undefined && typeof t === "function" ? t("json.truncated", { total }) : "已截断";
			const extraBlockLabel = t !== undefined && typeof t === "function" ? t("message.extraBlock") : "额外内容";
			const clock = clockText();
			const actions = el("div", { className: "dt-md-actions" },
				clock !== null ? el("span", { className: "dt-md-timeStart" }, clock) : null,
				el(Tooltip, { label: copied ? copiedLabel : copyLabel, side: "bottom" },
					el("button", {
						type: "button",
						className: "dt-md-action",
						"aria-label": copied ? copiedLabel : copyLabel,
						onClick: onCopy,
					}, copied ? el(IconCheckOutline16, null) : el(IconCopyOutline16, null)),
				),
			);
			return el("div", { className: "dt-md-userRow", "data-time-hover-root": "" },
				el("div", { className: "dt-md-userStack" },
					el(UiAttachment.ImageGallery, { images, load: loadImage, align: "end", labels }),
					showBubble ? el("div", { className: "dt-md-bubble" },
						el(MarkdownText, { text: protectReferenceBoundaries(textJoined) }),
						rest.map((block, i) => el(JsonBlock, { key: "b" + i, label: extraBlockLabel, payload: block, truncatedLabel })),
					) : null,
				),
				actions,
			);
		}

