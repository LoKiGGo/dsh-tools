# dsh-tools ↔ DeepSeek Harness 0.1.3-alpha.2 兼容审计（只读 · Mode A）

- 审计对象：`dsh-tools` v1.1.1（workspace `E:\Deepseek\PluginDevelop`，GitHub `LoKiGGo/dsh-tools`）
- 宿主：`@deepseek-ai/dsh` **0.1.3-alpha.2**（`dsh --version` 实测；嵌套核心包全量一致，见 §2）
- 走廊：`0.1.2-rc.1 → 0.1.3-alpha.1 → 0.1.3-alpha.2`（折叠 alpha.1 边；卡集见 §6）
- 方式：只读（未改任何源码 / 配置 / 依赖；未跑构建或生命周期脚本）
- 日期：2026-09-08

## 1. 结论

| 项 | 结论 |
| --- | --- |
| 是否需要更新 | **需要** —— 1 处功能性破坏（P0）+ 1 处声明基准漂移（P1） |
| P0 破坏面 | `wechat.openclaw` 的**流式文本通道**（微信回复文本全空） |
| P1 漂移面 | devDependencies 仍声明 `0.1.2-rc.1`，宿主已 0.1.3-alpha.2 |
| 其余 8 个功能 | 静态与运行探测均通过，无需改动 |
| 发布建议 | 修 P0 + 对齐 P1 → v1.1.2（补丁版） |

一句话：**宿主把顶层 `assistant/chunk` 会话事件删掉了**（Session format v2，0.1.3-alpha.1 起），
而 dsh-tools 微信功能的增量回复**完全依赖**该事件；其余触点全部存活，但 devDependencies 需随宿主对齐。

## 2. 版本事实

| 层 | 包 | 版本 | 证据 |
| --- | --- | --- | --- |
| CLI 壳 | `@deepseek-ai/dsh` | 0.1.3-alpha.2 | `E:\npm-global\node_modules\@deepseek-ai\dsh\package.json` |
| L1 核心 | 全部 `@deepseek-ai/dsh-*`（约 240 个） | **0.1.3-alpha.2**（统一） | `…\dsh\node_modules\@deepseek-ai\*\package.json` 全量采样 |
| L1 基座 | `@deepseek-ai/cordis` | 4.0.2 | 同上 |
| 被审计插件 | `dsh-tools` | 1.1.1 | workspace `package.json` |
| 插件声明基准 | devDeps `dsh-agent / dsh-llm / dsh-session` | **0.1.2-rc.1** | workspace `package.json` L43-47；工作区 `node_modules` 实装亦 rc.1 |
| 运行时 | Node | v24.18.0 | `node --version` |
| 安装形态 | profile web | `dsh-tools: link:E:/Deepseek/PluginDevelop` | junction Target = 工作区；bundles 激活 |

与上一轮审计（0.1.2-alpha.5 壳 + rc.1 核心的分层）不同：**本次壳与核心同为 0.1.3-alpha.2，无分层歧义**。

## 3. P0 · 微信流式文本通道失效（阻塞）

### 3.1 宿主侧变更（一手证据）

0.1.3-alpha.1 起引入 **Session format v2**，顶层 `assistant/chunk` 事件被取消：

- 当前宿主事件词汇（`dsh-session\lib\types\types.d.ts` L275-382）：
  `turn/start`、`turn/end`、`step/start`、`step/end`、`user/message`、**`assistant/message`**、
  **`assistant/attempt`**、`tool/call`、`tool/result`、`request/header`、`request/context`、
  `session/end-seed`、`session/not-found` —— **无 `assistant/chunk`**。
- `assistant/message` 现携带 `message` + **`stream: AssistantStreamRecord[]`**（嵌入流）+ 可选 `usage`（types.d.ts L291-299）；
  未结算 attempt 变成 `assistant/attempt`（L305-309）。
- 全树 grep（`…\dsh\node_modules\@deepseek-ai\**\*.js`，`assistant/chunk`）仅命中**两个冻结迁移包**：
  `dsh-session-format-v0-to-v1`（L37/306/1833/1918/2330）、`dsh-session-format-v1-to-v2`（L6/405/410/427/448/450/451/813）
  —— 它们是**迁移输入**，不是发射方。`dsh-session` / `dsh-agent` / `dsh-agent-loop` / `dsh-llm` 均 **0 命中**。
- 回归边界实证：工作区保留的 rc.1 副本 `dsh-session\lib\index.js` L861 `type: "assistant/chunk"`、L920（旧 appender）
  且 rc.1 `types.d.ts` 事件表含 `'assistant/chunk'` → **rc.1 有、alpha.2 无**，破坏由本次升级引入。

### 3.2 插件侧命中

| 文件 | 行 | 用法 | alpha.2 结果 |
| --- | --- | --- | --- |
| `lib/wechat/vendor/bridge.js` | L136-148 | `agent.ctx.on('session/event', …)` 且仅处理 `event.type === 'assistant/chunk'` | **永不触发** |
| 同上 | L104-126 | `applyStreamChunk` 解析 `block-start` / `text-delta` / `block-end` | 死代码 |
| `lib/wechat/gateway.js` | L211-215 → L226 → L245-253 | `onDelta` → `WeixinStreamingSender.feed` → `flush()` → 发送 `textReply` | `textParts` 为空 → **不发送任何文本** |
| `lib/wechat/vendor/weixin/driver.js` | L272 → L269 → L292 | 同上（vendor 驱动同构） | 同上 |

**关键放大点**：全 `lib/` grep 无 `result.text` —— 两个调用方都**不使用** `askAgentStreaming` 返回的聚合文本
（`result.text` 只在 `session-test.js` L65-80 被使用）。因此：

- 无 delta → `sender.pending` 始终为空 → `flush()` 的 `textParts` 为空；
- 媒体标记 `[image:]` / `[video:]` / `[file:]` / `[tts:]` 也走同一 `feed()` 管道 → **一并丢失**；
- 用户侧表现：微信里收不到文字回复（仅可能保留 typing 指示）；
- **掩蔽效应**：`session-test.js` 用 `r.text`（来自 `summarize()` 读 `assistant/message`）→ 自检**仍会通过**，
  真实回复却是空的。回归测试若只跑 smoke，抓不到这个破坏。

> 注：`wechat.openclaw` 默认关，但本 profile 实测**已启用**（§5），故该破坏在本部署是活的。

### 3.3 替代通道（一手证据，可直接用于修复）

alpha.2 把实时增量搬到 **agent 作用域事件 `agent/assistant-stream`**：

- 发射：`dsh-agent-loop\lib\index.js` L749-751 `this.dispatch.emit("agent/assistant-stream", { frame })`。
- 帧词汇（同文件 L122-183）：`start` → `chunk`（含 `attemptId`、`revision`、`index`、`time`、**`chunk`**）→ `end`
  （`outcome.kind = "committed" | "abandoned"`）。
- 消费范式：`dsh-headless\lib\index.js` L74-104
  `ctx.on("agent/assistant-stream", ({ agent: subject, frame }) => { if (subject !== agent) return; … frame.chunk.type … })`
  —— 正是 bridge.js 头部注释所引的「模式参考 dsh-headless」；另一消费者 `dsh-api-session-controller` L1338/L1431。
- `frame.chunk.type` 取值与插件现有 `applyStreamChunk` 基本同构：`text-delta`、`reasoning-delta`、
  `block-start`（`chunk.blockType`）、`block-end`（`chunk.block`）、`usage`、`finish`、`tool-call-delta`。

**修复方向**（待确认后实施）：`askAgentStreaming` 改订阅 `agent/assistant-stream`，按 `frame.chunk` 复用
`applyStreamChunk`；并在两个调用方补 `result.text` 兜底（无 delta 时发送聚合文本），使降级路径不再静默丢回复。

## 4. 逐卡核对（0.1.3-alpha.1 + alpha.2 全部卡）

| 卡 | 主题 | 插件命中 | 判定 |
| --- | --- | --- | --- |
| DSH-0.1.3-A1-01 | v0→v1 迁移器拒绝 0.1.2-alpha.x 日志 | 宿主 UI 读历史受阻；`usage-daily.js` 直接读原始 `.jsonl.zstd`（不经过迁移器） | 不阻塞（旁路） |
| DSH-0.1.3-A1-02 | 跨版本 `resume` cursor 报错 | 仅 0.1.2-alpha.3 写入的日志；本机微信会话由 rc.1 写入 | 观察项（见 §7-O4） |
| **未卡化 alpha.1 项：Session format v2** | 顶层 `assistant/chunk` 移除 | **bridge.js 流式订阅** | **P0 命中**（§3） |
| DSH-0.1.3-A2-01 | persona 拆 prefix/suffix | 插件不配置 persona / system-prompt / preset（grep 0 命中） | 不命中 |
| DSH-0.1.3-A2-02 | `SubprocessHandle.pid` 移除 | delete-chat 用 `spawn` + `handle.done` + `handle.collected` + `resolveExecutable`（无 `.pid`）；微信 lock 的 pid 是自建锁文件 | 不命中 |
| DSH-0.1.3-A2-03 | base 不再挂 `tool-str-replace-editor` | 插件不挂载/不引用工具行 | 不命中 |
| DSH-0.1.3-A2-04 | CLI `runCli()` + `import.meta.main` | Node v24.18.0 ≥ 24.2；`dsh --version` 实测正常；`restart-web.js` L135-136 以 `process.execPath` + `argv.slice(1)` 原样重放 | 不命中 |
| DSH-0.1.3-A2-05 | `pi-ai` `^0.85.1` | 插件不直接依赖 `@earendil-works/pi-ai` | 不命中 |

## 5. 其余触点与运行证据

**深 import 符号在 alpha.2 全部存活**（安装树符号级实证）：

| 插件用法 | alpha.2 位置 |
| --- | --- |
| `installModelSelection(agentCtx, { current, assembled })` | `dsh-agent\lib\types\model-selection.d.ts` L17-21、L41 |
| `createUserMessage` | `dsh-llm\lib\index.js` L48 |
| `SessionId` / `session.snapshotEvents()` | `dsh-session\lib\index.js` L9/L13、L1030/L1042/L1140 |
| `parseCmdline` | `dsh-cmdline\lib\index.js` L11/L91 |
| `defineTool` | `dsh-tools\lib\index.js` L837/L845 |
| `ctx.webServer.register` | `dsh-host-webserver\lib\index.js` L135/L171/L176 |
| `agents.create/resume` → `AgentHandle{ agent, dispose() }` + `whenIdle()` | `dsh-agent\lib\types\index.d.ts` L284/L292；`runtime-types.d.ts` L122 |
| `subprocess.spawn/resolveExecutable` + `handle.done/collected` | `dsh-subprocess\lib\types\index.d.ts` L56/L88 |

**运行探测（只读，POST 本插件端点）**：

- `/dsh-tools/api/ping` → `{"ok":true,…}`（宿主半边已挂载）
- `/dsh-tools/api/config` → 9 个 feature 全部 `enabled=true`（含 `wechat.openclaw`、`ui.usage`）
- `/dsh-tools/api/harness-check` → `{"current":"0.1.3-alpha.2","latest":"0.1.3-alpha.2","outdated":false}`

**会话日志口径（`ui.usage` / `delete-chat`）**：

- `usage-daily.js` L141-143 只认 `assistant/message` + `data.usage` → alpha.2 仍在（types.d.ts L291-299），
  且 `assistant/attempt` 无 `usage` 被自然忽略 → 聚合口径不变。
- 文件命名 `session.jsonl.zstd` 与多帧 zstd 仍成立（`dsh-session-persistence-jsonl` L752-758；磁盘实测存在）。
- `delete-chat.js` L159-167 的会话目录识别、L174-208 目录大小、L377-395 删除均无移除 API 依赖。

## 6. 走廊卡集状态（独立复核）

- 已维护卡集上界：`references/v0.1.3-alpha.2.md`（5 张，`from: dsh-v0.1.3-alpha.1`，status `draft`）+ `references/v0.1.3-alpha.1.md`（2 张，`from: dsh-v0.1.2-rc.1`）。
- 卡集自述缺口：alpha.2 卡头明确把 **Session format v2** 列为「尚未卡化的 alpha.1 项，需从 `dsh-v0.1.3-alpha.1` tag 推导」。
  本轮 P0 正是落在这个缺口内 —— 已用**安装树一手证据**（§3）补齐，建议回填一张卡（`assistant/chunk` → 嵌入式 `stream` + `agent/assistant-stream`）。

## 7. 观察项与建议

- **O1（沿用上轮）**：`harness-check.js` 读的是 CLI 壳版本；本次壳=核心同版本，显示正确，分层误导隐患仍在。
- **O2**：`usage-daily.js` 对 v2 日志仍有效；无需改动。
- **O3**：`delete-chat.js` 与 alpha.2 持久化命名一致；无需改动。
- **O4**：微信 `resumeGatewayAgent` 跨版本恢复继承宿主 `cursor behind the last applied entry` 风险（A1-02）；
  调用方为「失败即 fallback 新建会话」，不崩但会丢上下文连续性 —— 升级后首次微信实测时留意。
- **建议动作**：① 修 P0（bridge.js 流式订阅 + 调用方 `result.text` 兜底）；② devDeps 对齐 `0.1.3-alpha.2`
  （0.1.3 首个上 npm 的构建，`alpha` dist-tag）；③ 跑十套 smoke + 补一条「无 delta 时仍发送聚合文本」的回归断言；
  ④ 升 v1.1.2；⑤ 由用户点插件自带「一键重启」并做一次微信实测（本轮无法代验，见下）。

## 8. 未完成验证（Pending）

- **微信实测未做**：本环境无法发微信消息；P0 目前是「静态 + 宿主源码 + 回归边界」三级证据，
  缺一条「升级后真实回复为空」的运行时记录（`os.tmpdir()\openclaw-*.log` 中 `stream delta` 行会直接证明或证伪）。
  建议修复后由用户实测一次并回填本条。
- **Mode C 已执行**：用户确认后按「修 P0 + 对齐 devDeps + 跑 smoke，先不发布」实施，记录见 §10。

## 9. 附录 · 复现命令

```powershell
# 宿主版本分层
(Get-Content 'E:\npm-global\node_modules\@deepseek-ai\dsh\package.json' -Raw | ConvertFrom-Json).version
# 事件词汇（应无 assistant/chunk）
Select-String -LiteralPath "$h\dsh-session\lib\types\types.d.ts" -Pattern "^\s+'[a-z-]+/[a-z-]+':"
# 全树 assistant/chunk（应只命中两个 format 迁移包）
#   用 grep 工具：path = …\dsh\node_modules\@deepseek-ai, pattern = assistant/chunk, include = *.js
# 替代通道
Select-String -Path "$h\dsh-agent-loop\lib\index.js" -Pattern 'agent/assistant-stream'
Select-String -Path "$h\dsh-headless\lib\index.js"   -Pattern 'agent/assistant-stream'
```

## 10. 实施记录（Mode C · 2026-09-08）

用户选择：**修 P0 + 对齐 devDeps + 跑 smoke，先不发布**。

### 10.1 改动清单

| 文件 | 改动 | 说明 |
| --- | --- | --- |
| `lib/wechat/vendor/bridge.js` | `applyStreamChunk` 兼容「帧内原始 chunk」与「旧信封」两种入参 | L104-134 |
| 同上 | `askAgentStreaming` 双通道订阅：v2 `agent/assistant-stream` 帧 + 旧 `session/event` 的 `assistant/chunk`；两者互斥不重叠 | L157-183 |
| 同上 | 增量兜底：一个 delta 都没发布时把 `summarize()` 的聚合文本整体交给 `onDelta`（消除「静默空回复」） | L196-199 |
| `package.json` | 版本 `1.1.1` → **`1.1.2`**；devDeps `dsh-agent / dsh-llm / dsh-session` `0.1.2-rc.1` → **`0.1.3-alpha.2`** | npm 实测存在（dist-tag `alpha` = 0.1.3-alpha.2） |
| `package-lock.json` | 重新生成（旧锁文件与 alpha.2 的 peer 集冲突，npm ERESOLVE） | 全量扫描：`0.1.2-rc.1` 出现 **0** 次；实装 dsh-agent/dsh-llm/dsh-session = 0.1.3-alpha.2、cordis 4.0.2 |
| `README.md` | 新增 `## v1.1.2 更新` 节（兼容 + 修复 + 回归说明） | 排在 v1.1.1 节之后，与 1.1.x 升序惯例一致 |
| `test/wechat-openclaw-smoke.mjs` | 新增回归：v2 帧通道 / 旧信封通道 / 无增量兜底 / `applyStreamChunk` 双形态 / 订阅注销 | 原先该套件对 bridge 流式路径**零覆盖**（正是 P0 能静默通过自检的原因） |

未改动：`lib/wechat/gateway.js`、`lib/wechat/vendor/weixin/driver.js`（两处调用方共用同一 `askAgentStreaming`，单点修复即可）、client 半边、其余 8 个功能。

### 10.2 验证

- **基线**（改动前）：十套 smoke 全绿，**零预存在失败**（豁免清单为空）。
- **改动后**：`node --check` 通过；十套 smoke 全绿（含新增 5 组断言）。
- **宿主一手实证**：在**当前运行的 0.1.3-alpha.2 进程**内挂临时监听器实测 `agent/assistant-stream`，
  捕获 **1969 帧**：`start` ×4、`chunk:block-start` ×10、`chunk:reasoning-delta` ×751、
  **`chunk:text-delta` ×59**、`chunk:tool-call-delta` ×1123、`chunk:block-end` ×10、`chunk:usage` ×4、
  `chunk:finish` ×4、`end` ×4（监听器用完即注销，未留残留）。
  → 新通道确实在发射，且 `text-delta` 正是修复所消费的词汇。
- **依赖**：`npm install` 退出 0，15 个包；锁文件无旧 cohort 残留。

### 10.3 待办 / 残留风险

- **已发布**（2026-09-08，用户明确同意后执行）：commit **`6533fbb`** + tag **`v1.1.2`** → 推送 GitHub（`master` + tag 远端确认）+ 建 Release
  （https://github.com/LoKiGGo/dsh-tools/releases/tag/v1.1.2 ，`releases/latest` 已指向 v1.1.2）+ 发布 npm
  （`dsh-tools@1.1.2`，`dist-tags.latest` = 1.1.2，官方源 tarball 77 条目、含 `cordis.patch.yml`/`lib/client.js`）。
  途中三坑已回填 `publish.md`：push 需 `-c http.version=HTTP/1.1`、api.github.com 经代理需重试、npm `PUT 202` 校验期版本端点暂 404。
- **用户已一键重启**（19:28:57；`bridge.js` mtime 19:26:12 早于重启 → 新代码已加载）。**微信实测仍待做**：发一条消息，
  日志判据 `%TEMP%\openclaw-<date>.log` 出现 `stream delta … chars` 且最终 `replied to …`；
  若只有 `replied to` 而无 `stream delta`，说明走的是新兜底路径（整段发送）。
- **回滚**：`git reset --hard v1.1.1`（或 `git revert 6533fbb`）；工作区 HEAD = `6533fbb`（v1.1.2），上一发布点 = `d0bf905`（v1.1.1）；rc.1 旧副本备份在 `.cache/rc1-keep/`（gitignore 内）。

