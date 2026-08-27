		// --- settings page: 「dsh 工具箱」 ---

		function WechatPanel() {
			const cfg = useConfig();
			const [status, setStatus] = React.useState(null);
			const [error, setError] = React.useState("");
			const [hint, setHint] = React.useState("");
			const [busy, setBusy] = React.useState("");
			const [login, setLogin] = React.useState({ sessionKey: "", qrcodeDataUrl: "", status: "", message: "", awaitingVerifyCode: false, verifyCode: "" });
			const [allowText, setAllowText] = React.useState("");
			const [sessionMode, setSessionMode] = React.useState("room");
			const [media, setMedia] = React.useState({ loading: false, items: [] });
			const [aiForm, setAiForm] = React.useState({
				asr: { baseUrl: "", apiKey: "", model: "" },
				vision: { baseUrl: "", apiKey: "", model: "" },
				image: { baseUrl: "", apiKey: "", model: "" },
			});
			const pollRef = React.useRef(null);

			const wxConfig = featureConfigOf(cfg, "wechat.openclaw");

			React.useEffect(() => {
				if (cfg !== null) {
					const list = Array.isArray(wxConfig.allowFrom) ? wxConfig.allowFrom : [];
					setAllowText(list.join("\n"));
					setSessionMode(wxConfig.sessionMode === "per-user" ? "per-user" : "room");
				}
				// 只在 cfg 快照到达/变化时同步表单。
			}, [cfg]); // eslint-disable-line react-hooks/exhaustive-deps

			React.useEffect(() => {
				if (status === null || status.aiCapabilities === undefined) return;
				setAiForm((prev) => {
					const next = {};
					for (const id of ["asr", "vision", "image"]) {
						const cap = status.aiCapabilities[id] || {};
						next[id] = {
							baseUrl: prev[id].baseUrl !== "" ? prev[id].baseUrl : (cap.baseUrl || ""),
							apiKey: prev[id].apiKey,
							model: prev[id].model !== "" ? prev[id].model : (cap.model || ""),
						};
					}
					return next;
				});
			}, [status]);

			const loadStatus = React.useCallback(() => {
				apiWechat("status").then(setStatus, (err) => setError(String((err && err.message) || err)));
			}, []);

			const loadMedia = React.useCallback(() => {
				setMedia((prev) => Object.assign({}, prev, { loading: true }));
				apiWechat("media/list").then((items) => {
					setMedia({ loading: false, items: Array.isArray(items) ? items : [] });
				}, (err) => {
					setMedia({ loading: false, items: [] });
					setError(String((err && err.message) || err));
				});
			}, []);

			React.useEffect(() => {
				loadStatus();
				loadMedia();
				const timer = window.setInterval(loadStatus, 2000);
				return () => window.clearInterval(timer);
			}, [loadStatus, loadMedia]);

			React.useEffect(() => () => {
				if (pollRef.current !== null) window.clearInterval(pollRef.current);
			}, []);

			const stopLoginPoll = () => {
				if (pollRef.current !== null) {
					window.clearInterval(pollRef.current);
					pollRef.current = null;
				}
			};

			const pollLogin = () => {
				if (login.sessionKey === "") return;
				apiWechat("login/poll", { sessionKey: login.sessionKey }).then((value) => {
					setLogin((prev) => Object.assign({}, prev, {
						status: value.status,
						message: value.message || "",
						awaitingVerifyCode: value.awaitingVerifyCode === true,
					}));
					if (value.status === "confirmed" || value.status === "already_connected" || value.status === "failed" || value.status === "cancelled" || value.status === "expired") {
						stopLoginPoll();
						loadStatus();
					}
				}, () => {});
			};

			const startLogin = () => {
				setBusy("login");
				setError("");
				stopLoginPoll();
				apiWechat("login/start").then((value) => {
					setLogin({ sessionKey: value.sessionKey, qrcodeDataUrl: value.qrcodeDataUrl || "", status: "wait", message: "", awaitingVerifyCode: false, verifyCode: "" });
					pollRef.current = window.setInterval(pollLogin, 1500);
					setBusy("");
				}, (err) => {
					setError(String((err && err.message) || err));
					setBusy("");
				});
			};

			const submitVerify = () => {
				if (login.sessionKey === "" || login.verifyCode.trim() === "") return;
				apiWechat("login/verify", { sessionKey: login.sessionKey, code: login.verifyCode }).then(() => {
					setLogin((prev) => Object.assign({}, prev, { verifyCode: "", awaitingVerifyCode: false }));
				}, (err) => setError(String((err && err.message) || err)));
			};

			const cancelLogin = () => {
				if (login.sessionKey !== "") apiWechat("login/cancel", { sessionKey: login.sessionKey }).catch(() => {});
				stopLoginPoll();
				setLogin({ sessionKey: "", qrcodeDataUrl: "", status: "", message: "", awaitingVerifyCode: false, verifyCode: "" });
			};

			const saveConfig = (next) => {
				setFeatureConfig("wechat.openclaw", Object.assign({}, wxConfig, next)).then(loadStatus, (err) => setError(String((err && err.message) || err)));
			};

			const saveAllow = () => {
				const allowFrom = allowText.split("\n").map((s) => s.trim()).filter(Boolean);
				saveConfig({ allowFrom });
			};

			const allowSender = (userId) => {
				const current = Array.isArray(wxConfig.allowFrom) ? wxConfig.allowFrom : [];
				if (current.includes(userId)) return;
				saveConfig({ allowFrom: [...current, userId] });
				setHint("已加入白名单；若网关正在运行，需停止并重新启动网关（或重启 dsh web）后生效。");
			};

			const logoutAccount = (accountId) => {
				if (!window.confirm("确定注销微信账号 " + accountId + "？将删除本地登录凭据。")) return;
				setBusy("logout-" + accountId);
				setError("");
				apiWechat("account/logout", { accountId }).then(() => {
					loadStatus();
					setHint("已注销账号 " + accountId);
				}, (err) => setError(String((err && err.message) || err))).finally(() => setBusy(""));
			};

			const cleanMedia = () => {
				if (!window.confirm("确定清理所有微信聊天文件缓存？此操作只删除媒体缓存，不会删除账号凭据或会话记录。")) return;
				setBusy("clean-media");
				setError("");
				apiWechat("media/clean").then(() => {
					loadMedia();
					setHint("已清理微信聊天文件缓存。");
				}, (err) => setError(String((err && err.message) || err))).finally(() => setBusy(""));
			};

			const openMedia = (path) => {
				apiWechat("media/open", { path }).then((value) => {
					if (value !== null && typeof value === "object" && value.ok === false) setError(value.message || "打开失败");
				}, (err) => setError(String((err && err.message) || err)));
			};

			const setAiField = (id, field, value) => {
				setAiForm((prev) => Object.assign({}, prev, { [id]: Object.assign({}, prev[id], { [field]: value }) }));
			};

			const saveAiConfig = () => {
				setBusy("ai-config");
				setError("");
				apiWechat("ai/config", { capabilities: aiForm }).then(() => {
					loadStatus();
					setHint("AI 配置已保存到 ~/.openclaw/weixin-dsh/.env。");
				}, (err) => setError(String((err && err.message) || err))).finally(() => setBusy(""));
			};

			const startGateway = () => {
				setBusy("start");
				setError("");
				apiWechat("gateway/start").then((value) => {
					if (value !== null && typeof value === "object" && value.ok === false) setError(value.message || "启动失败");
					loadStatus();
					setBusy("");
				}, (err) => {
					setError(String((err && err.message) || err));
					setBusy("");
				});
			};

			const stopGateway = () => {
				setBusy("stop");
				apiWechat("gateway/stop").then(loadStatus, (err) => setError(String((err && err.message) || err))).finally(() => setBusy(""));
			};

			const gatewayRunning = status !== null && (status.gatewayState === "running" || status.gatewayState === "starting");
			const statusText = status === null
				? "读取中…"
				: status.gatewayState === "running"
					? (status.captureOnly === true ? "运行中（仅记录模式，白名单为空）" : "运行中")
					: status.gatewayState === "starting"
						? "启动中…"
						: status.gatewayState === "stopping"
							? "停止中…"
							: status.gatewayState === "error"
								? "异常：" + (status.lastError || "未知错误")
								: "已停止";
			const recentSenders = status !== null && Array.isArray(status.recentSenders) ? status.recentSenders : [];
			const aiCaps = status !== null && status.aiCapabilities !== undefined && status.aiCapabilities !== null ? status.aiCapabilities : {};

			return el("div", { className: "dt-wx-body" },
				el("div", { className: "dt-wx-row" },
					el("span", { className: "dt-wx-label" }, "网关状态"),
					el("span", { className: "dt-wx-text" }, statusText),
				),
				error !== "" ? el("div", { className: "dt-wx-muted", style: { color: "var(--dsw-alias-danger)" } }, error) : null,
				hint !== "" ? el("div", { className: "dt-wx-muted", style: { color: "var(--dsw-alias-state-business-primary)" } }, hint) : null,

				el("details", { className: "dt-wx-details" },
					el("summary", { className: "dt-wx-summary" }, "使用说明"),
					el("div", { className: "dt-wx-muted", style: { padding: "8px 10px", border: "1px solid var(--dsw-alias-border-l1)", borderRadius: 8, lineHeight: "20px" } },
						"白名单为空时也可以启动网关（仅记录模式），所有消息都会被拦截并在「最近发送者 ID」里记录；用你想放行的微信给机器人发一条消息，复制显示的 ID 到「白名单」输入框（每行一个）保存，再重启网关即可生效。",
					),
				),

				el("div", { className: "dt-wx-row" },
					el("span", { className: "dt-wx-label" }, "已登录账号"),
					el("div", { className: "dt-wx-text" },
						status === null || status.accounts === undefined || status.accounts.length === 0
							? el("span", { className: "dt-wx-muted" }, "未登录")
							: status.accounts.map((a) => el("div", { key: a.accountId, className: "dt-wx-row", style: { gap: 10 } },
								el("span", { className: "dt-wx-muted" }, a.accountId),
								el("span", { className: "dt-wx-muted" }, "登录于 " + (a.loginAt ? new Date(a.loginAt).toLocaleString() : "未知时间")),
								el("button", {
									type: "button",
									className: "dt-btn dt-wx-btn-danger",
									disabled: busy === "logout-" + a.accountId,
									onClick: () => logoutAccount(a.accountId),
								}, busy === "logout-" + a.accountId ? "注销中…" : "注销登录"),
							)),
					),
				),

				el("details", { className: "dt-wx-details" },
					el("summary", { className: "dt-wx-summary" }, "AI 能力"),
					el("div", { className: "dt-wx-body", style: { marginTop: 6 } },
						el("div", { className: "dt-wx-muted" }, "语音转文字：" + (aiCaps.asr && aiCaps.asr.configured ? "已配置（" + aiCaps.asr.model + "）" : "未配置")),
						el("div", { className: "dt-wx-muted" }, "图像理解：" + (aiCaps.vision && aiCaps.vision.configured ? "已配置（" + aiCaps.vision.model + "）" : "未配置（若已装 modlens，将自动提示 Agent 用 modlens_read_image）")),
						el("div", { className: "dt-wx-muted" }, "文生图：" + (aiCaps.image && aiCaps.image.configured ? "已配置（" + aiCaps.image.model + "）" : "未配置")),
						el("div", { className: "dt-wx-muted", style: { marginTop: 6 } }, "示例配置（写入 ~/.openclaw/weixin-dsh/.env）："),
						el("pre", { className: "dt-wx-pre" }, "AI_ASR_BASE_URL=https://your-gateway/v1\nAI_ASR_KEY=sk-xxx\nAI_ASR_MODEL=SenseVoiceSmall\n\nAI_VISION_BASE_URL=https://api.deepseek.com/v1\nAI_VISION_KEY=sk-xxx\nAI_VISION_MODEL=deepseek-v4-flash-vision-exp\n\nAI_IMAGE_BASE_URL=https://your-gateway/v1\nAI_IMAGE_KEY=sk-xxx\nAI_IMAGE_MODEL=gpt-image-2"),
						el("div", { className: "dt-wx-muted", style: { marginTop: 6 } }, "也可以只配一组全局：AI_GATEWAY_BASE_URL / AI_GATEWAY_KEY"),
						el("div", { className: "dt-wx-muted", style: { marginTop: 6 } }, "配置（写入 ~/.openclaw/weixin-dsh/.env，密钥不显示）："),
						[["asr", "语音转文字"], ["vision", "图像理解"], ["image", "文生图"]].map(([id, label]) => el("div", { key: id, className: "dt-wx-row", style: { gap: 6 } },
							el("span", { className: "dt-wx-muted", style: { minWidth: 70 } }, label),
							el("input", { className: "dt-wx-input", placeholder: "Base URL", value: aiForm[id].baseUrl, onChange: (e) => setAiField(id, "baseUrl", e.target.value) }),
							el("input", { className: "dt-wx-input", type: "password", placeholder: "API Key", value: aiForm[id].apiKey, onChange: (e) => setAiField(id, "apiKey", e.target.value) }),
							el("input", { className: "dt-wx-input", placeholder: "Model", value: aiForm[id].model, onChange: (e) => setAiField(id, "model", e.target.value) }),
						)),
						el("button", { type: "button", className: "dt-btn", disabled: busy === "ai-config", onClick: saveAiConfig, style: { marginTop: 6 } }, busy === "ai-config" ? "保存中…" : "保存 AI 配置"),
					),
				),

				el("div", { className: "dt-wx-row" },
					login.qrcodeDataUrl !== ""
						? el("img", { className: "dt-wx-qr", src: login.qrcodeDataUrl, alt: "微信登录二维码" })
						: el("span", { className: "dt-wx-muted" }, "尚未发起登录"),
					el("button", { type: "button", className: "dt-btn", disabled: busy === "login", onClick: startLogin }, busy === "login" ? "登录中…" : "扫码登录"),
					login.sessionKey !== "" ? el("button", { type: "button", className: "dt-btn", onClick: cancelLogin }, "关闭二维码") : null,
				),
				login.message !== "" ? el("div", { className: "dt-wx-muted" }, login.message) : null,
				(login.status === "confirmed" || login.status === "already_connected")
					? el("div", { className: "dt-wx-muted" }, "扫码成功。此二维码区域可用「取消登录」关闭；已保存的登录凭据不会被删除。")
					: null,
				login.awaitingVerifyCode
					? el("div", { className: "dt-wx-row" },
						el("input", {
							className: "dt-wx-input",
							value: login.verifyCode,
							placeholder: "手机微信显示的配对码",
							onChange: (e) => setLogin((prev) => Object.assign({}, prev, { verifyCode: e.target.value })),
						}),
						el("button", { type: "button", className: "dt-btn primary", onClick: submitVerify }, "提交配对码"),
					)
					: null,

				el("div", { className: "dt-wx-row" },
					el("span", { className: "dt-wx-label" }, "白名单"),
					el("textarea", {
						className: "dt-wx-textarea",
						value: allowText,
						placeholder: "每行一个微信 ID；留空 = 拒绝所有消息",
						onChange: (e) => setAllowText(e.target.value),
						onBlur: saveAllow,
					}),
				),
				el("div", { className: "dt-wx-muted" }, "白名单保存后，若网关正在运行，需要停止并重新启动网关（或重启 dsh web）后才会生效。"),
				el("div", { className: "dt-wx-row" },
					el("span", { className: "dt-wx-label" }, "最近发送者 ID"),
					el("div", { className: "dt-wx-text" },
						recentSenders.length === 0
							? el("span", { className: "dt-wx-muted" }, "暂无记录。启动网关后，让微信用户给机器人发一条消息即可看到。")
							: recentSenders.map((item) => el("div", { key: item.userId, className: "dt-wx-row", style: { gap: 10 } },
								el("span", { className: "dt-wx-muted" },
									item.userId + (item.allowed ? "（已放行）" : "（未放行）") + " · " + new Date(item.at).toLocaleTimeString(),
								),
								item.allowed
									? null
									: el("button", {
										type: "button",
										className: "dt-btn dt-wx-btn-success",
										onClick: () => allowSender(item.userId),
									}, "允许放行"),
							)),
					),
				),
				el("div", { className: "dt-wx-row" },
					el("span", { className: "dt-wx-label" }, "媒体缓存"),
					el("div", { className: "dt-wx-text" },
						media.loading
							? el("span", { className: "dt-wx-muted" }, "加载中…")
							: media.items.length === 0
								? el("span", { className: "dt-wx-muted" }, "暂无缓存目录。")
								: media.items.map((item) => el("div", { key: item.path, className: "dt-wx-row", style: { gap: 10, justifyContent: "space-between" } },
									el("span", {
										className: "dt-wx-muted",
										title: "点击打开文件夹：" + item.path,
										style: { cursor: "pointer", textDecoration: "underline" },
										onClick: () => openMedia(item.path),
									}, item.name + "（" + item.fileCount + " 个文件）"),
									el("span", { className: "dt-wx-muted" }, formatBytes(item.size)),
								)),
					),
					el("button", {
						type: "button",
						className: "dt-btn dt-wx-btn-danger",
						disabled: busy === "clean-media",
						onClick: cleanMedia,
					}, busy === "clean-media" ? "清理中…" : "清理聊天文件缓存"),
				),
				el("div", { className: "dt-wx-row" },
					el("span", { className: "dt-wx-label" }, "会话模式"),
					el("select", {
						className: "dt-wx-select",
						value: sessionMode,
						onChange: (e) => {
							const next = e.target.value;
							setSessionMode(next);
							saveConfig({ sessionMode: next });
						},
					},
						el("option", { value: "room" }, "room（所有微信用户共享一个 DSH 会话）"),
						el("option", { value: "per-user" }, "per-user（每个微信用户独立会话）"),
					),
				),

				el("div", { className: "dt-wx-row" },
					gatewayRunning
						? el("button", { type: "button", className: "dt-btn", disabled: busy === "stop", onClick: stopGateway }, busy === "stop" ? "停止中…" : "停止网关")
						: el("button", { type: "button", className: "dt-btn primary", disabled: busy === "start", onClick: startGateway }, busy === "start" ? "启动中…" : "启动网关"),
				),
			);
		}

