# dsh-tools ↔ DeepSeek Harness 0.1.7-rc.2 兼容审计（只读 · Mode A）

- 审计对象：`dsh-tools` v1.1.2（HEAD `6533fbb`，工作树含未发布的 v1.1.3 改动）
  - workspace：`E:\Deepseek\PluginDevelop`（GitHub `LoKiGGo/dsh-tools`）
- 宿主：`@deepseek-ai/dsh` **0.1.7-rc.2**（2026-09-26 21:38 安装；嵌套核心包统一 0.1.7-rc.2）
- 走廊：`0.1.3-alpha.2 → 0.1.5-rc.1 → 0.1.7-rc.2`（插件声明基准 = 0.1.5-rc.1）
- 方式：**只读**（未改任何源码 / 配置 / 依赖；未跑安装或构建；未改动 profile）
- 日期：2026-09-26

## 1. 结论

| 项 | 结论 |
| --- | --- |
| 插件**能否加载** | ✅ 能（无加载期崩溃、无缺失符号） |
| 是否有**功能性破坏** | ⚠️ **有 1 处代码级破坏**：`generate_image` 工具静默注册失败（见 §5.0 / P0） |
| 插件是否在本机**正在运行** | ❌ **没有运行** —— profile 已不含 `dsh-tools` 插件行（见 §3） |
| 走廊内格式破坏 | 1 处（**Session format v3 → v4**），日志名判定**已被现有代码覆盖**；但 v4 迁移**放大了用量重复计数**（见 §5） |
| 声明基准漂移 | devDeps 仍写 `0.1.5-rc.1`，宿主已 `0.1.7-rc.2`（P1，声明性） |
| 顺带发现的既有缺陷 | 4 项（P1/P2），**不是本次升级引入**，详见 §8 |
| 上游走廊卡 | 只到 `v0.1.3-alpha.2`；0.1.4–0.1.7 **全部无卡**（见 §9） |

一句话：**宿主侧 API 与事件通道全部存活、插件能正常加载**，但 **`wechat.openclaw` 的
`generate_image` 工具注册会抛 `TypeError` 并被插件自己的 try/catch 静默吞掉**（唯一真正的
功能性破坏，属代码级修复）；**并且它现在根本没被加载** —— profile 的 `dsh.profile.bundles`
已被削减到只剩 DSH 自带两个 bundle，所有第三方插件行（不只是 dsh-tools）都不在了。

> 修正：本报告初稿曾判定"代码完全不需要修改"。补充核对 `tools.register()` 契约后，
> 发现 **P0（`output` 必填）** 这一条被前一版漏掉，已在此更正并展开于 §5.0。

> 另有一项与插件无关、但会让任何"受限沙箱内跑命令"失败的部署级故障：
> 新增的 `@deepseek-ai/dsh-sandbox-windows-acl` 在 `E:\Deepseek\PluginDevelop` 上
> `SetNamedSecurityInfoW … Win32 5`（该目录未给调用者 `WRITE_OWNER`），fail-closed 拒绝执行。
> 本会话最初正是被它挡住（改用 `danger-full-access` 后才恢复）。详见 §10。

## 2. 版本事实

| 层 | 包 | 版本 | 证据 |
| --- | --- | --- | --- |
| CLI 壳 | `@deepseek-ai/dsh` | **0.1.7-rc.2** | `E:\npm-global\node_modules\@deepseek-ai\dsh\package.json`（mtime 2026-09-26 21:38:30） |
| L1 核心 | 嵌套 `@deepseek-ai/dsh-*` | **0.1.7-rc.2**（统一） | `…\dsh\node_modules\@deepseek-ai\*\package.json` 抽样一致 |
| L1 基座 | `@deepseek-ai/cordis` | **4.0.4** | 同上 |
| 被审计插件 | `dsh-tools` | 1.1.2（tag `v1.1.2`） | workspace `package.json`；`git describe` = `v1.1.2` |
| 插件声明基准 | devDeps `dsh-agent / dsh-llm / dsh-session` | **0.1.5-rc.1** | workspace `package.json` L43-49；workspace `node_modules` 实装亦 0.1.5-rc.1（cordis 4.0.2） |
| 安装形态 | profile web | `dsh-tools: link:E:/Deepseek/PluginDevelop` | `C:\Users\13768\.dsh\profiles\web\package.json`；junction Target 确认指向工作区 |
| 运行时 | Node | v24 系（宿主进程 `node …\dsh\lib\bin.js web`） | `Get-CimInstance Win32_Process` |

要点：**壳与核心同为 0.1.7-rc.2，无分层歧义**（不同于 `0.1.2-alpha.5 壳 + rc.1 核心` 那一轮）。
工作区保留了**真实的 0.1.5-rc.1 副本**（`E:\Deepseek\PluginDevelop\node_modules\@deepseek-ai\`），
因此本轮能做**真实的双侧 diff**，而不是只读宿主单侧。

## 3. 【最高优先级】插件当前未被加载 —— 这是环境问题，不是代码问题

### 3.1 运行证据（活宿主 `http://127.0.0.1:3080`）

| 探测 | 结果 | 判读 |
| --- | --- | --- |
| `POST /dsh-tools/api/ping` | **405**，空 body | 落进 `frontend-static` 的 **fallback 座位**（"非 GET/HEAD 即 405"） |
| `POST /dsh-tools/api/nonexistent` | **405**，空 body | 同上：**该前缀根本没有注册路由** |
| `GET /dsh-tools/api/ping` | **404**，空 body | dist 里没有这个文件 |
| `GET /dsh-tools/api/events` | **404** | 同上 |
| `GET /plugins/dsh-tools/client.js` | **404** | 客户端 bundle 不在模块图里 |
| `GET /plugins/??dsh-tools/client.js` | **404** | combo 资源同样不存在 |
| `GET /` | **401** | 新宿主要求浏览器 cookie（见 §7） |

对照：若插件已挂载，`POST /dsh-tools/api/ping` 必定返回 `200 {"ok":true,…}`（上一轮审计实测如此）。
`405` 的出处已定位到 `dsh-host-frontend-static\lib\index.js:87-92`
（`registerFallback` 里 `req.method !== "GET" && !== "HEAD"` → `405`）——
即**路由表 miss 之后落到静态兜底**，证明 `/dsh-tools/api` 这条 prefix 路由不存在。

### 3.2 根因：profile 的 bundle 列表被削减

`C:\Users\13768\.dsh\profiles\web\package.json`（mtime 2026-09-25 08:41:47）：

```json
"dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"] } }
```

对比 profile 自带备份（同一目录）：

| 文件 | mtime | bundles |
| --- | --- | --- |
| `package.json`（在用） | 2026-09-25 08:41 | `dsh-base`, `dsh-web-app` ← **仅 2 个** |
| `package.json.bak` | 2026-09-25 08:41 | 上述 + `dshmarket` |
| `package.json.bak-20260910-213635` | 2026-09-10 21:36 | `dsh-base`, `dsh-web-app`, `dsh-tools`, `dshmarket`, `dsh-better-sidebar`, `dsh-pet` 等 **14 个** |

即：**9/25 那次 profile 写入把第三方 bundle 全部摘除了**；`dependencies` 里 12 个包仍在（含
`"dsh-tools": "link:E:/Deepseek/PluginDevelop"`），但 **dependencies 不会让插件运行** ——
宿主的插件行来自 `dsh.profile.bundles` → 各包自带的 `dsh.bundle.patch` 层，
或 profile 自己的 `cordis.patch.yml` insert 列表。

交叉验证：
- `profiles\web\cordis.patch.yml`（21:39 被 CLI 重写为模板）**只**插入 `file-changes` /
  `client-file-changes` / `dsh-vscode-bridge` 三条，**没有 dsh-tools**；
- `profiles\web\cordis.yml` = `[]`（空根，符合模板注释）；
- 插件自身的 patch 文件**内容正确**（`cordis.patch.yml`：`- insert: - id: dsh-tools / name: 'dsh-tools'`）
  —— 缺的是"有人去应用它"。

### 3.3 影响面：不止 dsh-tools

客户端 bundle 端点对 `dshmarket / dsh-pet / dsh-better-sidebar / dsh-docs-panel / dsh-excel-panel /
dsh-free-search / dsh-sidebar-qa / dsh-skill-mcp-panel / dsh-whale-widget / modlens / dsh-vscode-bridge`
**全部 404** —— 与"只有 2 个内置 bundle"完全一致。
**所以这不是 dsh-tools 坏了，是这个 profile 现在跑的是"裸 DSH"。**

> 待用户确认的一点：这次削减是**有意的**（例如为排查升级问题而把 profile 清干净、
> 准备逐个加回），还是**意外**（升级/插件管理操作误写）。这决定 §11 走 A 还是 B。

## 4. 判定

**判定：dsh-tools 需要 1 处针对性代码修复（P0），其余不需要为 0.1.7-rc.2 改动。**

依据：
1. §5.0：**P0** —— `wechat-openclaw.js:449` 的工具注册缺 `output`，在新宿主上必抛
   `TypeError` 并被静默吞掉 ⇒ `generate_image` 永不注册。**需要改代码**（形状明确，见 §5.0 修法）。
2. §5.1：格式破坏 v3→v4 的**日志名判定已被现有代码覆盖**，无需改动；
   但 §5.3 的用量重复计数被 v4 放大，建议顺手修。
3. §5.4：vendor 深 import 实际跑 0.1.5-rc.1 副本 —— **最高风险的未验证项**，建议随 devDeps 对齐一并消除。
4. §6：插件消费的宿主触点（路由契约、事件通道、服务名、客户端 slot、其余深 import）**逐一存活**。
5. §7：新增的窗口认证**不影响**插件的自定义路由。
6. §8 的 4 个问题**都是既有缺陷**（在 0.1.5-rc.1 上同样存在），不是本次升级引入。

需要用户决策的是 **§3 的启用问题**（环境）、**§5.0 的 P0 修复**（代码）与 **§8 的既有缺陷**（是否顺手修）。


## 5. 走廊内破坏性变更

### 5.0 【P0】`tools.register()` 现在强制要求 `output{schema,render}` → `generate_image` 静默注册失败

**这是本轮唯一真正的功能性破坏（代码级修复）。**

- 插件调用点：`lib/features/wechat-openclaw.js:449-463` —— 传的是**裸定义**
  `{name, description, parameters, execute}`，**没有 `output`**。
- 宿主实现（0.1.7-rc.2，`@deepseek-ai/dsh-tools`）：
  ```js
  // dsh-tools\lib\index.js:2878-2882
  register(definition) {
      const name = definition.name;
      const output = definition.output;
      if (output === void 0 || typeof output !== "object" || typeof output.render !== "function" || …)
          throw new TypeError(`tool "${name}" must declare output { schema, render, presentationMeta? }`);
  ```
  类型契约同样把它标为**必填**：`dsh-tools\lib\types\index.d.ts:115-117`
  （`interface ToolDefinition extends ToolSchema { readonly output: ToolOutputDefinition; }`），
  `ToolOutputDefinition` 定义在 `:106-113`（`schema` 必填、`render` 必填、`presentationMeta` 可选）。
- 症状链：
  1. `register()` 抛 `TypeError`；
  2. 被插件自己的 `try/catch`（`wechat-openclaw.js:465-467`）吞掉，**只写一行日志**；
  3. ⇒ `wechat.openclaw` 路径下 agent **永远无法调用 `generate_image`**（文生图能力静默消失），
     而界面/日志不会报错。
- **对照：另一条路径是对的** —— `lib/wechat/vendor/weixin/gateway.js:15-29` 用官方
  `defineTool({...})` 包装，**带了** `output: { schema: {type:'string'}, render: (_a,v) => […] }`，
  因此不受影响。即同一个工具在两处注册，只有 `features/` 这一处是坏的。
- 修法形状：把 `wechat-openclaw.js:449` 的定义改为 `defineTool({... , output: { schema: {type:'string'}, render: (_args, value) => [{ type:'text', text:`图片已生成: ${value}` }] } })`，
  与 `vendor/weixin/gateway.js:21-24` 保持一致。
- **时间归属未定**：本机没有 0.1.5-rc.1 的 `@deepseek-ai/dsh-tools` 副本可对比，
  因此无法证明该约束是 0.1.7 新引入还是本就存在。**不影响修复必要性**（无论如何现在都注册不上）。

### 5.1 Session format v3 → v4（日志名已被覆盖，但放大了用量重复计数）

### 5.1 实证

```text
workspace  E:\Deepseek\PluginDevelop\node_modules\@deepseek-ai\dsh-session\lib\types\types.js:54
           export const SESSION_FORMAT_VERSION = 3;
宿主        E:\npm-global\…\dsh-session\lib\types\types.js:54
           export const SESSION_FORMAT_VERSION = 4;
```

- 迁移链新增 `dsh-session-format-v2-to-v3`、**`dsh-session-format-v3-to-v4`**
  （另有新的 `dsh-session-format` / `dsh-session-format-catalog`）。
- 日志文件名带"格式世代"：`dsh-session-format\lib\index.js:472-474`
  → v0 为 `session.jsonl`，其后为 `session.v${N}.jsonl` ⇒ 现在是 **`session.v4.jsonl.zstd`**。
- 磁盘实证（`C:\Users\13768\.dsh\sessions` 递归统计）：

  | 文件名 | 数量 |
  | --- | --- |
  | `session.v3.jsonl.zstd` | 91 |
  | `session.jsonl.zstd` | 18 |
  | `session.v2.jsonl.zstd` | 14 |
  | **`session.v4.jsonl.zstd`** | **5** ← 21:39~21:46 新写，**升级后正在用 v4** |

### 5.2 为什么"已被覆盖"

| 插件侧 | 判定 |
| --- | --- |
| `lib/features/session-log.js:15` `SESSION_LOG_FILENAME_RE = /^session(?:\.v\d+)?\.jsonl(?:\.zstd)?$/` | ✅ 天然匹配 `.v4.`，**无需改动** |
| `usage-daily.js:142-151` 只读 `assistant/message` 的 `data.usage` + `message.source` | ✅ 该事件与 `TokenUsage` 在 0.1.5↔0.1.7 **逐字节相同** |
| `delete-chat.js:167` 用同一 `isSessionLogFilename` | ✅ 同上 |
| v4 主要变化点：`tool/result` 从"user-role 包装块"改为**一等 tool-role message**；新增 `developer/message`、`image/offload`、`workspace/changes` | ✅ 插件**不读** `tool/result`，也忽略未知事件类型 → 非命中 |
| **迁移保留旧世代文件** → `usage-daily.js` 把同一会话的多代日志**重复累加** | ⚠️ **放大了一处既有缺陷**，见下 |

### 5.3 【P1】v4 迁移放大用量重复计数（`usage-daily`）

- 迁移**不删除**旧世代文件：`dsh-session-persistence-jsonl\lib\index.js:1947-1989` 写
  `session.migration.<token>…tmp` 后落成新世代，**全树无 unlink**；宿主文档亦述
  "released migration, immutable prior-generation"（`dsh-session\lib\index.js:50-56`）。
- 插件扫描逻辑：`lib/features/usage-daily.js:186-203`（`walkSessionFiles` 递归收集**所有**
  `session*.jsonl.zstd`）、`:296-302`（全部合并）→ 一个会话目录里若同时存在
  `session.v2/v3/v4.jsonl.zstd`，token 会被**按世代数累加**。
- 磁盘实证：`C:\Users\13768\.dsh\sessions` 下**有 15 个会话目录同时存在多代日志**，
  例如 `session-31a2838b-…` 同时有 `session.jsonl.zstd` + `.v2` + `.v3` + `.v4`。
- 症状：用量页对"跨格式世代迁移过的会话"**虚高**。机制在 v0/v2/v3 时代就存在（属既有缺陷），
  **但 v4 迁移把此前只有单世代的会话也卷了进来**，影响面因此变大。
- 修法形状：每个会话目录**只取最高 `vN` 的一代**（或按 `header` 去重），而不是全量累加。

### 5.4 【P1】vendor 深 import 跑的是插件自带的 0.1.5-rc.1 副本，不是宿主 0.1.7-rc.2

- `lib/wechat/vendor/bridge.js:12/14/15` 的裸指定符解析到**工作区本地**
  `node_modules\@deepseek-ai\{dsh-agent,dsh-llm,dsh-session}`，
  实测版本均为 **0.1.5-rc.1**（与 `package.json:44-46` devDependencies 一致），
  **不是**宿主的 0.1.7-rc.2 副本。
- 含义：§6.1 的"宿主侧符号存在性"**并不决定微信路径的实际运行时行为** ——
  实际跑的是 0.1.5-rc.1 的 `installModelSelection`（agent 作用域协议）与
  `createUserMessage`，被注册进一个 **0.1.7-rc.2 的 agent 作用域**。
- 这是本报告**风险最高但未能验证**的一条：需要一次真实微信往返才能确认。
  若要在结构上消除它，应把 devDeps 对齐到 0.1.7-rc.2 并重装（即选项 B）。

注：`session-log.js` 与相关改动位于**工作树的未提交 v1.1.3**（`?? lib/features/session-log.js`，
README「v1.1.3 更新（未发布）」）。也就是说：**这层保护只存在于工作区，尚未发布到 npm**。

## 6. 宿主触点逐项核对（0.1.7-rc.2）

### 6.1 深 import 符号（最脆弱的一类）—— 全部存活

用脚本在两侧真实 import 并比对导出表（0.1.5-rc.1 vs 0.1.7-rc.2）：

| 插件 import | 位置 | 0.1.5-rc.1 | 0.1.7-rc.2 | 判定 |
| --- | --- | --- | --- | --- |
| `installModelSelection` | `lib/wechat/vendor/bridge.js:12` | ✅ | ✅ | 导出表 **8 → 8，完全一致** |
| `createUserMessage` | `bridge.js:14` | ✅ | ✅ | ✅ |
| `SessionId` | `bridge.js:15` | ✅ | ✅ | `dsh-session` 导出表 **26 → 27**（仅新增 `buildForkSeed`，无删除） |
| `parseCmdline` | `lib/wechat/vendor/weixin/entry.js:12` | 未装 | ✅ | ✅ 存在 |
| `defineTool` | `lib/wechat/vendor/weixin/gateway.js:1` | 未装 | ✅ | ✅ 存在 |

`dsh-llm` 是唯一有删除的包：**移除** `offloadRequestImagesWithPolicy`、`offloadedImagePrefixCount`；
新增 `ACCOUNT_QUOTA_EXCEEDED_CODE` / `IMAGE_OFFLOAD_REQUIRED_CODE` / `createDeveloperMessage` /
`projectOffloadedImages` / `projectToolUpdates` / `requiredImageOffload`。
→ 全 `lib/` grep：插件**从不引用**被删的两个符号 ⇒ **非命中**。

### 6.2 事件与通道

| 触点 | 宿主 0.1.7-rc.2 证据 | 判定 |
| --- | --- | --- |
| `agent/assistant-stream`（微信流式回复的主力通道） | 发射 `dsh-agent-loop\lib\index.js:1053`；帧类型 `AssistantStreamFrame` = `start`/`chunk`/`end`（`dsh-agent\lib\types\runtime-types.d.ts:107-137`），载荷 `{agent, frame}`（`:366-369`） | ✅ 与插件 `bridge.js:158-171` 的消费方式**完全吻合**（该结构在两侧逐字节相同） |
| chunk 词汇 `text-delta` / `block-start` / `block-end` | `dsh-llm\lib\types\types.d.ts:417-447`（`text-delta.text`、`block-end.block`） | ✅ 与 `applyStreamChunk` 读取的字段一致 |
| `session/event` + `assistant/chunk`（旧兼容分支） | 自 0.1.3-alpha.1 起已无 `assistant/chunk` | ⚪ 仍是**死分支**（有兜底，无害） |
| `assistant/message` 的 `{message, stream, usage?, interrupted?}` | `dsh-session\lib\types\types.d.ts:330-338` | ✅ `summarize()` / `usage-daily` 读取路径不变 |
| `ctx.on("agent/status", …)` + `agents.roots()` | `dsh-agent\lib\types\runtime-types.d.ts:252`、`index.d.ts:364` | ✅ 均存在 |
| `session.snapshotEvents()` | 仍存在，但已标 **`@deprecated`**（`dsh-session\lib\types\index.d.ts:187`，注记 2026-09-09："new calls are prohibited"） | ⚠️ 软弃用（见 §8-P3） |

### 6.3 路由 / loader / 清单 / 服务名

| 触点 | 宿主 0.1.7-rc.2 证据 | 判定 |
| --- | --- | --- |
| `ctx.webServer.register({kind:'prefix', path, handler})` | `dsh-host-webserver\lib\index.js:177-179`（`exact`→exact 表，其余→prefixes 表）、最长前缀匹配 `:322-331`、返回 disposer | ✅ 契约不变 |
| `ctx.effect(fn)` | cordis 生命周期；宿主自身大量使用（如 `dsh-client-modules\lib\index.js:546`） | ✅ |
| `ctx.loader.entries()` + `entry.disabled` / `entry.fiber` | `cordis-plugin-loader\lib\types\config\entry.d.ts:6-35` | ✅（`plugin-catalog.js:132-142` 用法成立） |
| 服务名 `agents` / `sessions` / `loader` / `tools` / `subprocess` / `sessionQuery` / `sessionPersistence` / `workspaceRegistry` / `sandboxPolicy` / `appExit` | 逐一在宿主存在 | ✅ |
| `dsh.bundle.patch`（字符串） | `dsh-app-boot` 接受 **string 或 string[]** | ✅ 插件的字符串形式合法 |
| `dsh.client.platform = "web"` + `exports["./client"]` | `dsh-client-modules\lib\index.js:713-719`（仅要求 `platform`，另有可选 `inject`/`external`/`immediately`） | ✅ 满足，**无新增必填字段** |
| peer `@deepseek-ai/cordis ^4.0.1` | 宿主 4.0.4；插件工作区实装 4.0.2 | ✅ 满足（`4.0.4` 在 `^4.0.1` 内） |
| `subprocess.spawn` + `handle.done` / `collected` / `resolveExecutable` | `SubprocessHandle` **无 `.pid`**（0.1.3 起即如此），插件本就不用 `.pid` | ✅ 非命中 |
| 客户端 slot `settings.section` / `shell.overlay` / `settings.plugins.tab` + `useSessions` prop | 均仍存在并渲染；插件用的 `ctx.slots.inject('settings.section', () => ctx.slots.register({name,id,order,label}, …))` 正是宿主文档示例写法 | ✅ |

## 7. 新增的窗口认证（0.1.7 新机制）是否影响插件

宿主新增 `@deepseek-ai/dsh-client-connection`（旧版清单里没有它），带来"浏览器 cookie 认证"：

- `GET /` → **401**：`dsh-client-connection\lib\index.js:444-450`
  （`writeUnauthorized`：`dsh web authentication required; reopen the URL printed by dsh web.`）；
- 认证闸门只作用在**它自己注册的 `/api` 前缀**（`:829-843`）与其 index 授权（`:388-427`）；
- `/plugins`（客户端 bundle）**无认证**；插件的自定义 `/dsh-tools/api` 前缀**不受该闸门管辖**。

⇒ **对 dsh-tools 无影响**：浏览器带 cookie 的同源请求照常通过；
插件现有的 loopback/`sec-fetch-site`/`Origin` 围栏继续独立生效。
（本会话探测之所以 401/404/405，是因为我没有 cookie，而这恰好把"路由是否挂载"暴露得很干净。）

## 8. 既有缺陷（**不是**本次升级引入；是否修由用户决定）

### P1-A · `trustedHostsOf()` 取错 loader 字段 → 非回环访问全部 403

- 插件：`lib/index.js:163-168`
  ```js
  for (const entry of ctx.loader.entries()) {
      if (entry.options.name === "connection") return entry.options.config?.trustedHosts ?? [];
  }
  ```
- 宿主：`EntryOptions.name` 是**模块指定符**，`id` 才是行 id
  （`cordis-plugin-loader\src\config\entry.ts:10-23`）。
  `dsh-web-app\cordis.patch.yml` 里那一行是：
  ```yaml
  - id: connection
    name: '@deepseek-ai/dsh-client-connection'
    config: { trustedHosts: !!js ctx.webRuntime.trustedHosts }
  ```
  ⇒ `entry.options.name === "connection"` **永不成立**，`trustedHosts` 恒为 `[]`。
- 症状：非回环访问（LAN / `--trusted-host`）时 `isTrustedApiRequest` 一律 false，
  `/dsh-tools/api/*`（含 SSE）**全部 403** —— 工具箱设置页读不到配置。
  回环访问（本机 `127.0.0.1`）先命中 loopback 分支，所以**现在看不出来**。
- 备注：同一仓库的 `plugin-catalog.js:134-141` 用 `entry.options.name` 当 `moduleName`
  是**正确**的（它要的就是模块名）；错的是 `trustedHostsOf` 的语义假设。修法是改判 `entry.options.id === "connection"`（或匹配完整模块名）。

### P1-B · 客户端 `ctx.sessions.open(id)` 在 0.1.7-rc.2 不存在

- 调用点：`lib/client/notify.js:108-110`、`:139-141`（点 toast / 桌面通知 → 跳到会话），
  `lib/client/delete-chat.js:180`。
- 宿主：`ISessions` 契约（`dsh-api-session-controller\lib\types\client\contract\sessions.d.ts:43-153`）
  只有 `list / retain / using / retainInfo / searchResultLimit / create / subagentAddress /
  refreshProjections / refresh / search / fork / scope / scopeOf / sessionOf / binding` —— **没有 `open`**。
  导航语义已迁到 `ctx.uiWorkspace.openSession(...)`。
- 症状：点通知只消失、**不跳转**；delete-chat 的"打开会话"是死键。因为处处 `typeof … === "function"` 守卫，
  **没有任何报错**。插件自己的 `test/client-smoke.mjs` 用假的 `sessions:{open}`，所以测试全绿也抓不到。
- 注：该字段很可能从来不是宿主 API（旧审计曾据此断言"已接通"），属**长期潜伏**而非升级破坏。

### P1-C · 客户端 `useSessions(s => s.current)` 恒为 `undefined`

- 调用点：`lib/client/notify.js:59`（配 `:13` 的"只通知当前会话"过滤）。
- 宿主：`SessionListState = { ids, byId, phase, projectionsBySession }`
  （`dsh-api-session-controller\lib\types\client\sessions\service.d.ts:43-52`）—— **无 `current`**。
- 症状：过滤条件永不成立 ⇒ 页面失焦时**每个会话**的 turn-done 都会弹通知（打扰性过度通知）。
  "当前会话"现在的来源是 `ctx.uiSession.current` / `ctx.uiWorkspace`。

### P2 · 其余观察

- `window.dshDesktop.closeWindow()` / `.restartService()` 在 web 宿主不存在
  （宿主只在 `globalThis.dshDesktop` 上暴露 `protocolVersion`/`updates`/`browser`/`shortcuts`/`keyboard`）。
  重启有 HTTP 兜底（`POST /dsh-tools/api/restart`，仍可用）；受影响的是"重启完成后关掉旧标签页"
  —— `window.close()` 对非脚本打开的标签页会被浏览器拒绝，需手动关。
- `persistence.locate()` 在 0.1.7 的类型里是 **`private`**（`dsh-session-persistence-jsonl\lib\types\index.d.ts:81`），
  而 `delete-chat.js:278,365` 在调用它；运行时可用，但新公开替代是 `resolveCurrentLog(id, signal)`。**潜在脆弱点**。
- `session.snapshotEvents()` 已被 `@deprecated`（"new calls are prohibited"，2026-09-09 注记），
  微信 bridge 的聚合路径在用；目前**仍可用**，属需要留意的技术债。
- `harness.check` 的版本发现：本轮壳=核=0.1.7-rc.2，卡片显示正确，
  旧的"读到壳版本造成分层误导"隐患本轮**不显现**；若日后再现壳/核分层需重看。

## 9. 走廊卡与证据可得性

- 上游 `plugin-upgrade` skill 的 `references/` **最新只到 `v0.1.3-alpha.2.md`（verifiedAt 2026-09-07）**；
  **0.1.4 / 0.1.5 / 0.1.6 / 0.1.7 全部无卡** —— 整条走廊是未卡化缺口。
  建议回填两张卡：① Session format v3→v4；② Windows ACL 沙箱 fail-closed 边。
- 宿主安装树内**没有** CHANGELOG / UPGRADING / MIGRATION / BREAKING 文档（glob+grep 全树确认）。
- 本机**无 npm cache**（`AppData\Local\npm-cache\_cacache` 不存在），0.1.6 中间版本 tarball 不可恢复。
- 可做真 diff 的范围：`dsh-agent` / `dsh-llm` / `dsh-session`（0.1.5-rc.1 副本在 workspace）。
  其余（`dsh-base` / `dsh-web-app` / `dsh-host-webserver` / `dsh-client-modules` / `dsh-app-boot` /
  `dsh-subprocess` / `dsh-sandbox*` / `dsh-agent-loop` / `dsh-session-persistence-jsonl`）
  **只有 0.1.7-rc.2 单侧源码**，其"走廊内何时变化"属推断。

## 10. 与插件无关但影响本机使用的部署级故障：Windows ACL 沙箱

- 新增包 `@deepseek-ai/dsh-sandbox-windows-acl@0.1.7-rc.2`（由 `dsh-sandbox-local` 接入）：
  Windows ACL 受限令牌沙箱（`WRITE_RESTRICTED` + capability SID + Low integrity，经 `koffi` 调 advapi32）。
- 本机报错 `SetNamedSecurityInfoW failed (Win32 5): grantWrite(E:\Deepseek\PluginDevelop)`
  出自 `…\dsh-sandbox-windows-acl\lib\types-*.js`（`applyResult !== 0` → `throwWin32`）。
- 该包自述：**任何 Win32 失败都 fail-closed**，且"被授权目录必须是调用者所有并授予 `WRITE_OWNER`；
  只给 Modify 的 DACL 现在会**大声失败**而不是静默跳过"。`E:\Deepseek\PluginDevelop` 正是这种情况。
- 影响：**该工作区内一切受限 shell 命令都跑不了**（本会话开局的两次 shell 失败即此因）。
  对 dsh-tools 自身功能影响低（它的 `subprocess.spawn` 由**未受限的宿主进程**发起）。
- 修法在插件之外：给该目录补齐所有权/`WRITE_OWNER`（或 Full control），或继续用 `danger-full-access`。

## 11. 待用户决策的选项

| 选项 | 内容 | 说明 |
| --- | --- | --- |
| **P0（建议先做）** | 修 `lib/features/wechat-openclaw.js:449`：用 `defineTool` 包装并补 `output{schema,render}`（照抄 `vendor/weixin/gateway.js:21-24`） | 唯一的功能性破坏；改动小、可精确验证 |
| **A 把插件跑起来** | 用宿主自带 plugin-manager 的 `set_bundle`（设置页插件管理 / `dsh plugin`）把 `dsh-tools` 重新选为 bundle，重启 `dsh web`，再用 `/dsh-tools/api/ping` + 设置页验证 | 纯配置、可回滚；先确认"代码在 0.1.7-rc.2 上确实活着" |
| **B 对齐声明 + 消除 5.4 隐患** | devDeps `0.1.5-rc.1 → 0.1.7-rc.2`、重装、README 补 v1.1.3 说明 | 让 vendor 深 import 跑宿主同版本，消除 §5.4 的版本错配 |
| **C 修既有缺陷** | P1-A（id/name）、P1-B（改 `uiWorkspace.openSession`）、P1-C（改 `uiSession.current`）、§5.3（用量去重） | 独立于版本升级的 4 个真 bug；建议**单独一轮**做 |
| **D 发布 v1.1.3** | 把工作树里未发布的 v1.1.3（含 v4 日志名兼容）发出去 | 让 v4 兼容不只存在于工作区 |

> 备注：本轮为**只读审计**（Mode A），未改动任何源码 / 配置 / 依赖 / profile。
> 上表任何一项要动手时，将按 plugin-upgrade / plugin-release 流程另出计划并征得确认。

## 12. 启用记录（用户选择选项 A/2 · 2026-09-26）

用户决定"若无需修改则启用"。因存在 §5.0 的 P0（待改代码），按用户规则**未改任何 dsh-tools 代码**；
仅执行**环境启用**（把 9/25 被摘掉的 bundle 选回去），并实测其后果。

### 12.1 改动内容（唯一一处，可回滚）

- 备份：`profiles\web\package.json.pre-dsh-tools-enable-20260926`（改动前 651 字节）。
- 编辑：`C:\Users\13768\.dsh\profiles\web\package.json` 的 `dsh.profile.bundles`
  由 `["@deepseek-ai/dsh-base","@deepseek-ai/dsh-web-app"]`
  改为 `[… , "dsh-tools"]`（仅追加一项，JSON 校验通过）。
- 回滚：把备份文件覆盖回 `package.json` 即可。

### 12.2 验证结果（实测）

| 验证项 | 结果 |
| --- | --- |
| `dsh --profile web --dump-config` 组装树 | ✅ 出现 `# == dsh-tools` / `- id: dsh-tools` / `name: dsh-tools` |
| **是否需要重启** | ❌ **不需要** —— 宿主 PID 6884（启动于 21:39:12，早于本次改动）**热应用**了 profile 改动 |
| `POST /dsh-tools/api/ping` | ✅ `200 {"ok":true,"value":{"ok":true,"pong":…}}` |
| `POST /dsh-tools/api/config` | ✅ 9 个 feature 全部 `enabled=true` |
| `POST /dsh-tools/api/harness-check` | ✅ `{"current":"0.1.7-rc.2","latest":"0.1.7-rc.2","outdated":false,"error":""}` |
| `POST /dsh-tools/api/plugin-catalog` | ✅ 返回 189 行 loader 条目 |
| loader 行状态 | ✅ `entryId=include:dsh-tools`、`moduleName=dsh-tools`、`category=local`、`spec=link:E:/Deepseek/PluginDevelop`、`fiberPhase=active` |
| 客户端 bundle 资产 | ✅ `lib/client.js` 存在（174003 B），`id: "dsh-tools"` 注册名与宿主硬校验一致 |
| 插件注册的 HTTP 路由（405 探针） | ✅ `PUT /dsh-tools/api/ping → 405`（插件自己的 method guard，证明**该路由已注册**） |

### 12.3 未能验证与遗留观察

- **客户端 UI 未验证**：`/plugins/<任一插件 id>/client.js`（含 `?rev=` 与 `??` combo 两种宿主自身
  URL 形状）**全部返回 404**，连 DSH 自带客户端插件也一样。已排除"插件未挂载"这一解释
  （`include:modules` 的 `fiberPhase=active`；`/` 与静态资产正常：`GET /manifest.webmanifest → 200`）。
  因 `Origin` 头探针不生效（该路由**不做** Connection 的 Host/Origin 围栏，故不会返回 403）、
  且 `frontend-static` 兜底对任意非 GET 也返回 405，**从外部无法区分**"路由未注册"与
  "路由已注册但模块表为空"。**结论：宿主半边确定已运行；客户端设置页需在真实浏览器确认**
  （刷新页面，看「dsh 工具箱」设置分区是否出现）。
- 若刷新后设置页未出现，再考虑真实重启一次（profile 改动已持久化，重启必然生效）。
- §5.0 的 P0 **仍然存在**（本次按要求未动代码）：`image` 能力当前未配置，故尚未触发；
  一旦配置文生图，`generate_image` 会静默注册失败。

