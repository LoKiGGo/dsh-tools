# dsh-tools ↔ DeepSeek Harness 0.2.3-alpha.2 兼容审计与 v1.1.6 适配

- 审计对象：`dsh-tools` **v1.1.5**（HEAD `88ea4e4`，tag `v1.1.5`）
- 宿主：`@deepseek-ai/dsh` **0.2.3-alpha.2**（安装树内嵌套核心包全部 0.2.3-alpha.2，cordis **4.2.0-alpha.1**）
- 走廊：`0.2.0-rc.2 → 0.2.1-rc.2（上轮审计）→ 0.2.3-alpha.2`（插件声明基准 = 0.2.0-rc.2）
- 方式：运行时只读探测（`cordis_inspect` / HTTP / 文件系统）+ 官方 upgrade-guide 走廊逐条核对 + 深 import / 工具契约探针
- 日期：2026-11-24
- 结果：**2 处真实命中（1 个静默功能丢失 + 1 个 ABI 变更）+ 2 处声明/协议需要更新**，其余触点全部存活；已在本轮修到 v1.1.6。

## 1. 结论

| 项 | 结论 |
| --- | --- |
| 插件**能否加载** | ✅ 能（宿主 loader 条目 `include:dsh-tools` 存在；`/dsh-tools/api` 路由已注册） |
| 客户端是否挂载 | ✅ `settings.section` 的 `dsh-tools`（order 35）与 `shell.overlay` 的 `dsh-tools-notify`（order 100）均 `active` |
| 0.2.3-alpha.2 是否引入**功能性破坏** | ⚠️ **有 1 处静默丢失**：`settings.plugins.tab` slot 在 0.2.2-rc.3 被删除 ⇒「插件分类」页签不再渲染；另有 1 处微信模型选择 ABI 变更 |
| 是否需要改源码 | ✅ 需要（页签落点、`installModelSelection`、显式鉴权；另修 4 个既有 bug） |
| 会话格式破坏 | ❌ 无（Session format 仍为 **v4**，磁盘日志仍是 `session.v4.jsonl.zstd`） |
| devDeps 漂移 | ⚠️ 声明基准 0.2.0-rc.2 vs 宿主 0.2.3-alpha.2；且 cordis peer `^4.0.1` 不匹配 `4.2.0-alpha.1` |

**一句话**：插件没被弄坏到不可用，但「插件分类」页签已经静默消失、微信的模型选择在 0.2.3 上不再生效；本轮 v1.1.6 把这两处 + 4 个既有 bug 一起修掉。

## 2. 版本事实

| 层 | 包 | 版本 | 证据 |
| --- | --- | --- | --- |
| CLI 壳 | `@deepseek-ai/dsh` | **0.2.3-alpha.2** | `E:\npm-global\...\dsh\package.json`（安装时间 2026-11-24 21:00） |
| L1 核心 | 嵌套 `@deepseek-ai/dsh-*` | **0.2.3-alpha.2**（统一） | 宿主嵌套目录逐个读取 |
| L1 基座 | `@deepseek-ai/cordis` | **4.2.0-alpha.1** | 宿主嵌套 |
| 被审计插件 | `dsh-tools` | **1.1.5** | `git describe` = `v1.1.5` |
| 插件声明基准 | devDeps 五个包 | **0.2.0-rc.2** | v1.1.5 `package.json` |
| 插件实际加载的深 import 副本 | `dsh-agent` / `dsh-llm` / `dsh-session` / `dsh-tools` | **0.2.0-rc.2**（工作区副本） | 工作区 `node_modules`（v1.1.5 时） |
| 工作区 cordis | `@deepseek-ai/cordis` | **4.0.4**（v1.1.5 时） | 工作区 `node_modules` |
| 本机 Node | `E:\Program Files\nodejs\node.exe` | **v24.22.1** | 低于宿主 engines `^24.22.3 \|\| >=26.13.1` |

> 运行态 `Runtime.getVersion` 报 0.2.3-alpha.2。若升级前进程未重启，请再点一次「一键重启 dsh web」确保跑的是磁盘上的新代码。

## 3. 运行证据（活宿主 `http://127.0.0.1:3080`）

| 探测 | 结果 |
| --- | --- |
| `Runtime.getVersion` | `0.2.3-alpha.2` |
| 宿主 loader 条目 | `include:dsh-tools`（Config 目录可见，`status: absent` = 无 Config schema） |
| client `settings.section` | 占位者 `dsh-tools`，order 35，`active: true` |
| client `shell.overlay` | 占位者 `dsh-tools-notify`，order 100，`active: true` |
| client `settings.plugins.tab` | ❌ `available: false`（slot 已被宿主删除） |
| client `plugins.tab` | ✅ 存在（list slot；dsh-market 占 order -1） |
| `POST /dsh-tools/api/ping`（无 Cookie） | **401**（0.2.2-rc.2 起路由默认 `auth: required`） |
| `POST /dsh-tools/apiX`（未注册路径） | 405（证明 401 来自该路由的鉴权策略，而非全局拦截） |
| 今日会话日志 | `session.v4.jsonl.zstd`（`~/.dsh/sessions/--E-Deepseek-PluginDevelop--/...`） |

## 4. 走廊逐版核对（0.2.1-rc.2 → 0.2.3-alpha.2）

| 版本目录 | 命中 | 说明 |
| --- | --- | --- |
| v0.2.1-rc.2 | ❌ | agent/subagent/team/CUA/SDK 为主；`webserver-index-peer`、`tool-executor-plugins`、`session-store-writes` 均不涉及本插件 |
| v0.2.1-rc.3 | ❌ | 附件/下载/团队菜单等 |
| v0.2.1-rc.4 | ❌ | 模型列表刷新、推理 slot 文本、sandbox 错误类删除（本插件不 import 该类） |
| v0.2.2-alpha.2 | ❌ | loader 条目树 `write→commit`（本插件只读 `loader.entries()`）、右键菜单/CSS 锚点、schedule 工具 |
| v0.2.2-alpha.3 | ❌ | Office、subagent 命名、chat 活动分类 |
| v0.2.2-rc.1 | ❌ | `window-drag-regions` 仅 macOS Desktop；`package-export-cleanup` 命中的 3 个包均未使用；`BundleInfo.update` 本插件不消费（直接读写 profile 清单） |
| **v0.2.2-rc.2** | ✅ **P2** | `connection-page-peer`：WebServer 路由默认 `auth: 'required'`（旧宿主可无凭据访问） |
| **v0.2.2-rc.3** | ✅ **P0** | `settings-section-plugins-page`：删除 `settings.plugins.tab` slot；同时 `client-hmr` 事件流改造不影响本插件（不用 `/plugins/events`） |
| v0.2.2-rc.4 | ❌ | workspace-write 边界、搜索默认值 |
| v0.2.2-rc.5 | ❌ | `sessionQuery.inspectSession` 删除（本插件不用）；PTC/office/list_agents 等 |
| v0.2.3-alpha.1 | ⚠️ 环境 | Node 要求升到 24.22.3 / 26.13.1（与插件无关） |
| （上轮已覆盖）v0.2.1-alpha.3 / alpha.4 | ✅ **P1** | `engines.dsh` 优先判定（未声明，走 peer 规则，未阻断）；**`installModelSelection` 选择参数删除** |

> 上轮 `0.2.1-rc.2` 审计漏掉了 `v0.2.1-alpha.4` 的 `installModelSelection` 变更（该版本早于 rc.1）。本轮补上。

## 5. 命中项详情

### 5.1 【P0】`settings.plugins.tab` slot 被删除 —— 「插件分类」页签静默消失

- 变更：v0.2.2-rc.3 删除「设置 → 内置插件」及其两个包，`settings.plugins.tab` slot 与 `SettingsPluginsTabOwnerProps` 一并删除；「设置 → 插件管理」改为打开插件页面。
- 运行时证据：`cordis_inspect(client Slots, root="settings.plugins.tab")` → `available: false`。
- 影响：`lib/client/apply.js` 里的 `ctx.slots.inject("settings.plugins.tab", ...)` 永不触发 ⇒ 页签不出现，且没有任何报错（`inject` 对不存在的 slot 是静默的）。
- 修复（v1.1.6）：改挂 `plugins.tab`——插件管理页「已安装」之后的页签行（`dsh-market` 的「插件市场」就在同一行）。注册项仍是 `id: plugin-catalog, order: 20, label: 插件分类`，仍由 `configListeners` reconcile 随开关实时注册/注销。

### 5.2 【P1】`installModelSelection` 协议变更 —— 微信模型选择不再生效

- 变更（v0.2.1-alpha.4）：`installModelSelection(agentCtx, selection)` → `installModelSelection(agentCtx)`；`ModelSelectionRef` / `selection` 参数删除，选择改由 `agent.model.select(selection)`，`agent/request` 不再允许改 provider/model。
- 代码证据：
  - 工作区 0.2.0 实现：`installModelSelection(agentCtx, selection)` 会挂 `system-prompt/assemble`、`agent/request`、`agent/pre-step` 三个监听，靠 `selection.current/assembled` 覆盖 provider/model。
  - 宿主 0.2.3 声明：`export declare function installModelSelection(agentCtx: Context): () => void`；`_dsh_agent.d.ts` 中 `Agent.model: AgentModel`、`AgentModel.select(selection): void`。
- 影响：`lib/wechat/vendor/bridge.js` 仍传第二个参数 ⇒ 选择/推理强度覆盖失效（模型靠 `agents.create({agentOptions})` 兜底，`agentDefaultModel` 里的 `reasoningEffort: max` 会丢）。
- 修复：`setup(agentCtx, agent)` 内改为 `installModelSelection(agentCtx)` + 新增 `applyModelSelection(agent, selection)`（`agent.model.select`，缺 model face 的旧宿主静默跳过）。

### 5.3 【P1】声明基准 + cordis peer 不匹配

- devDeps 仍 0.2.0-rc.2：深 import 跑在工作区旧副本上，与宿主 0.2.3 错配（上轮审计的既有红线）。
- 新宿主 cordis 为 `4.2.0-alpha.1`；插件 peer `^4.0.1` 按 semver 不包含该预发布版本 ⇒ 重装可能 ERESOLVE。
- 修复：devDeps 5 个包全部对齐 `0.2.3-alpha.2`；peer 改 `~4.2.0-alpha.1`；删除 `package-lock.json` + `node_modules` 重装（精确版本 peer 网络）。

### 5.4 【P2】WebServer 路由默认鉴权变 `required`

- 变更（v0.2.2-rc.2）：`webServer.register` 新增 `auth: 'anonymous' | 'required' | 'deny'`，默认 `required`。
- 实测：`/dsh-tools/api/ping` 无凭据 401；旧宿主（0.2.1-rc.2）同请求是 200。
- 影响：页面内同源请求带登录 Cookie，功能不受影响；但本机 curl / 外部脚本不再能直接访问，且插件的 loopback fence 退化为纵深防御。
- 修复：显式写 `auth: "required"`，避免未来默认值变化把 API 意外公开；fence 保留。

## 6. 不受影响（逐项核过）

| 触点 | 判定 |
| --- | --- |
| 深 import 符号：`defineTool` / `validateArgs` / `assertSupportedJsonSchema`（dsh-tools）、`installModelSelection`（dsh-agent）、`createUserMessage`（dsh-llm）、`SessionId`（dsh-session） | ✅ 全部存活；被删符号（`dsh-tools` 7 个旧运行时/渲染器符号、`dsh-llm` 的 `assertUsableApiKey` / `normalizeApiKey`）都不是本插件用的 |
| `defineTool` / `tools.register` 契约（0.2.3 实测） | ✅ `output{schema,render}`、紧凑参数表、`validateArgs` 正反例全部通过 |
| Session 格式 | ✅ 仍 `SESSION_FORMAT_VERSION = 4`；`session-log.js` 正则继续覆盖 |
| `sessionQuery.listSessions` / `readTitleSnapshots` | ✅ 0.2.3 服务契约一致 |
| `sessionPersistence.locate`（delete-chat 体积/删除） | ✅ 抽象服务未声明，但 `JsonlSessionPersistence.locate(meta)` 仍存在（私有 API，技术债保留） |
| `workspaceRegistry.list()` / `.archivedSessionIds` | ✅ 仍在（`get archivedSessionIds()`） |
| `subprocess.spawn` / `resolveExecutable` / `handle.collected.*` | ✅ 契约一致 |
| `agentDefaultModel.currentSelection()` | ✅ 仍在 |
| `agent/status`、`agent/assistant-stream`（start/chunk/end）、`Session.snapshotEvents` | ✅ 仍在（`dsh-agent-loop` 发布帧） |
| client `settings.section` owner props `close` / 标准 props `useSessions` | ✅ 仍在 |
| 旧式 `window.__ModuleLoader__.load` 客户端包 | ✅ 仍可加载（0.2.2-rc.2 的 `meta`/静态库 manifest 是新增能力，旧包自带 `<style>` 仍被保留） |
| `plugins.bundle.config` / `settings.section.view` | ✅ 与本次迁移无关 |

## 7. 顺带修复的既有 bug（与升级无关）

| 编号 | 位置 | 症状 | 修复 |
| --- | --- | --- | --- |
| P1-A | `lib/index.js` `trustedHostsOf` | 判 `entry.options.name === "connection"`，实际 `options.name` 是模块名、`id` 才是 `include:connection` ⇒ 永远空 ⇒ 非回环访问全 403 | 优先 `ctx.webStartup.trustedHosts`（0.2.1-alpha.1 官方来源），loader 行 id/模块名兜底，请求期惰性解析 |
| P1-B | `lib/client/notify.js`、`delete-chat.js` | 调 `ctx.sessions.open(id)`，0.2.3 client face 无此方法 ⇒ 点通知只消失不跳转 | 新增 `openSessionById`：优先 `uiWorkspace.openSession`，旧宿主 `sessions.open` 兜底 |
| P1-C | `lib/client/notify.js` | `useSessions(s => s.current)`，`SessionListState` 无 `current` ⇒ 恒 undefined | 移除死订阅（标准 props 中无“当前会话”选择器；`PanelInfo` 只有 `activePanelId`） |
| P2 | `lib/features/restart-web.js` | 固定等 4s 探测端口；新宿主启动慢 ⇒ 误写 `port-down`（2026-11-24 20:58 实测） | 改为每秒轮询、最多 60s（`probeMs` 可配置，smoke 用 1.5s） |

## 8. 本轮改动清单（v1.1.6）

| 文件 | 改动 |
| --- | --- |
| `package.json` | 版本 1.1.6；devDeps 五包 → 0.2.3-alpha.2；peer cordis → `~4.2.0-alpha.1` |
| `package-lock.json` | 删除后重装重建 |
| `lib/client/apply.js` | `settings.plugins.tab` → `plugins.tab`；导出 `openSessionById` |
| `lib/client/core.js` | 新增 `openSessionById()`（uiWorkspace 优先 + 旧 face 兜底） |
| `lib/client/notify.js` | 移除 `s.current` 死订阅；点击改 `openSessionById` |
| `lib/client/delete-chat.js` | 「打开会话」改 `openSessionById` |
| `lib/wechat/vendor/bridge.js` | `installModelSelection(agentCtx)` + 新增 `applyModelSelection(agent, selection)` |
| `lib/index.js` | `auth: "required"`；`trustedHostsOf` 改 webStartup 优先 + 惰性解析 |
| `lib/features/restart-web.js` | 端口探测改轮询（`probeMs`，默认 60s） |
| `test/client-smoke.mjs` | slot 名改 `plugins.tab`；新增 `openSessionById` 断言 |
| `test/smoke.mjs` | 新增 `webStartup.trustedHosts` 放行断言 |
| `test/wechat-openclaw-smoke.mjs` | 新增 `applyModelSelection` 回归（含旧宿主跳过 / 空值） |
| `test/restart-launcher-smoke.mjs` | `probeMs: 1500` 保持套件快 |
| `README.md` | v1.1.6 更新说明；插件分类入口文案 |

## 9. 验证

- `node --check`：全部改动文件 0 错。
- 11 套 smoke：全部 temp dirs / fake `DSH_HOME`。
- `npm run build:client`：重新生成 `lib/client.js`（`apply.js`/`core.js`/`notify.js`/`delete-chat.js` 有改动）。
- **重启只能由用户点插件自带「一键重启 dsh web」**（本轮不代按）。
- 在线验证（重启后）：
  - `cordis_inspect(client Slots, root="plugins.tab")` 应看到 `plugin-catalog` 占位者 `active`；
  - `settings.section` / `shell.overlay` 两个占位者仍 active；
  - 页面内打开「设置 → 插件管理」应出现「插件分类」页签并能加载分类数据；
  - 需要 HTTP 直连时不再用无凭据 curl（401 属预期）。

## 10. 复跑探针

| 脚本 | 作用 |
| --- | --- |
| `upgrade-report/probe-0.2.3-alpha.2.mjs` | 逐包比对「工作区副本 vs 宿主」导出表差异 + `defineTool` 契约 + Session 格式 |
| `upgrade-report/probe-generate-image-def.mjs` | 用宿主原语验证 `generate_image` 定义形状（负向对照） |
| `upgrade-report/probe-deep-import-diff.mjs` | 旧版深 import 差异探针（路径固定 0.2.0/0.2.1 时代，可作为模板） |
