# dsh-tools ↔ DeepSeek Harness 0.2.0-rc.2 兼容审计（只读 · Mode A）

- 审计对象：`dsh-tools` v1.1.2（HEAD `6533fbb`，工作树含未发布的 v1.1.3 改动）
  - workspace：`E:\Deepseek\PluginDevelop`（GitHub `LoKiGGo/dsh-tools`）
- 宿主：`@deepseek-ai/dsh` **0.2.0-rc.2**（嵌套核心包统一 0.2.0-rc.2，cordis 4.0.4）
- 走廊：`0.1.5-rc.1 → 0.1.7-rc.2 → 0.2.0-rc.2`（插件声明基准 = 0.1.5-rc.1）
- 方式：**只读**（未改任何源码 / 依赖 / profile；仅重建 client bundle 做一致性校验，产物字节相同）
- 日期：2026-09-26

## 1. 结论：需要更新，但**不是**因为宿主把插件弄坏了

| 项 | 结论 |
| --- | --- |
| 插件**能否加载** | ✅ 能（`include:dsh-tools` `fiberPhase=active`） |
| 是否**正在本机运行** | ✅ **正在运行**（9 个功能全部 enabled，全部路由实测 200） |
| 0.2.0-rc.2 是否引入**功能性破坏** | ✅ **没有**（无破坏性变更命中插件） |
| 声明基准漂移 | ⚠️ devDeps 仍写 `0.1.5-rc.1`，宿主已 **0.2.0-rc.2** → **这是唯一真正需要更新的点** |
| 遗留 P0（上轮发现，审计时**仍未修**） | ⚠️ `generate_image` 注册必失败；当时**休眠**（图像能力未配置） |
| 走廊内格式破坏 | ❌ 无（Session format 仍为 **v4**） |
| **落地结果** | ✅ **已完成（v1.1.5）**：devDeps 对齐 0.2.0-rc.2 + P0 修复 + 回归测试，详见 §10 |

**一句话**：0.2.0-rc.2 没有破坏 dsh-tools —— 插件此刻正在新宿主上正常服务全部 9 个功能。
需要更新的是**声明基准**（devDeps `0.1.5-rc.1` → `0.2.0-rc.2`），外加修掉上轮就欠着的
`generate_image` P0。

> **本报告是审计当时的只读快照**；上表最后一行标注的是随后按用户指示实施的改动。
> 落地细节与验证记录见 §10。

## 2. 版本事实

| 层 | 包 | 版本 | 证据 |
| --- | --- | --- | --- |
| CLI 壳 | `@deepseek-ai/dsh` | **0.2.0-rc.2** | `dsh --version` |
| L1 核心 | 嵌套 `@deepseek-ai/dsh-*` | **0.2.0-rc.2**（统一） | `…\dsh\node_modules\@deepseek-ai\*\package.json` 抽查一致 |
| L1 基座 | `@deepseek-ai/cordis` | **4.0.4** | 宿主嵌套 |
| 被审计插件 | `dsh-tools` | 1.1.2（tag `v1.1.2`） | `git describe` = `v1.1.2` |
| 插件声明基准 | devDeps `dsh-agent/dsh-llm/dsh-session` | **0.1.5-rc.1** | workspace `package.json` L44-46 |
| 插件**实际加载**的核心包 | 同上三个 | **0.1.5-rc.1**（工作区副本） | `createRequire('…/bridge.js').resolve()` 实测 |
| 安装形态 | profile web | `dsh-tools: link:E:/Deepseek/PluginDevelop` | profile `package.json`；loader `spec` 一致 |
| npm dist-tags | `@deepseek-ai/dsh-agent` | `latest=0.1.0-rc.6`、**`next=0.2.0-rc.2`** | `npm view` |

要点：**壳与核心同为 0.2.0-rc.2，无分层歧义**。0.2.0-rc.2 在 npm 上是 `next` 标签，
`latest` 仍停在 `0.1.0-rc.6` —— 若用 `^` 之类浮动范围，解析到的不会是 0.2.0。

## 3. 运行证据（活宿主 `http://127.0.0.1:3080`）

| 探测 | 结果 |
| --- | --- |
| `POST /dsh-tools/api/ping` | ✅ `200 {"ok":true,"value":{"ok":true,"pong":…}}` |
| `POST /dsh-tools/api/config` | ✅ 9 个 feature 全部 `enabled=true` |
| `POST /dsh-tools/api/harness-check` | ✅ `{"current":"0.2.0-rc.2","latest":"0.2.0-rc.2","outdated":false}` |
| `POST /dsh-tools/api/plugin-catalog` | ✅ 200，30 205 B |
| `POST /dsh-tools/api/usage/daily` | ✅ 200，6 450 B（usage 数据持续更新，**未被 v4 卡住**） |
| `POST /dsh-tools/plugin-toggle/api/list` | ✅ 200 |
| `POST /dsh-tools/update-plugin/api/check` | ✅ 200（版本探测正常） |
| `POST /dsh-tools/delete-chat/api/list` | ✅ 200（含 live 会话） |
| `POST /dsh-tools/wechat.openclaw/api/status` | ✅ 200（`loggedIn:true`，账号在线） |
| loader 行 | ✅ `entryId=include:dsh-tools`、`fiberPhase=active`、`category=local` |

对照上轮（0.1.7-rc.2）插件**根本没被加载**，本轮是**已加载且全功能在线**。

## 4. 逐项核对：0.2.0-rc.2 的破坏性变更是否命中

### 4.1 深 import 符号（最脆弱的一类）—— 全部存活

用脚本在两侧真实 import 并比对导出表（0.1.5-rc.1 vs 0.2.0-rc.2）：

| 插件 import | 位置 | 0.1.5-rc.1 | 0.2.0-rc.2 | 判定 |
| --- | --- | --- | --- | --- |
| `installModelSelection` | `lib/wechat/vendor/bridge.js:12` | ✅ | ✅ | 导出表 **8 → 8，完全一致** |
| `createUserMessage` | `bridge.js:14` | ✅ | ✅ | `dsh-llm` **62 → 66**（无删除该符号） |
| `SessionId` | `bridge.js:15` | ✅ | ✅ | `dsh-session` **26 → 28**（仅新增，无删除） |
| `parseCmdline` | `vendor/weixin/entry.js:12` | 未装 | ✅ | ✅ **但该文件不可达**，见 §5.2 |
| `defineTool` | `vendor/weixin/gateway.js:1` | 未装 | ✅ | ✅ **但该文件不可达**，见 §5.2 |

- `dsh-llm` 是唯一有删除的包：**移除** `offloadRequestImagesWithPolicy`、`offloadedImagePrefixCount`；
  新增 `ACCOUNT_QUOTA_EXCEEDED_CODE` / `IMAGE_OFFLOAD_REQUIRED_CODE` / `createDeveloperMessage` /
  `projectOffloadedImages` / `projectToolUpdates` / `requiredImageOffload`。
  → 全 `lib/` grep：插件**从不引用**被删的两个符号 ⇒ **非命中**。

### 4.2 微信 bridge 实际用到的 agent/session API —— 全部存活

`bridge.js` 的真实气路（`agents.create` / `agents.resume` / `agent.followup` /
`agent.ctx.on('agent/assistant-stream')` / `session.snapshotEvents()` / `session.seq`）
在 **0.1.5-rc.1 与 0.2.0-rc.2 两侧均存在**（逐符号扫描 `.d.ts`）。

### 4.3 Session format：仍为 v4，**未产生新世代**

| | 版本 |
| --- | --- |
| workspace `dsh-session`（0.1.5-rc.1） | `SESSION_FORMAT_VERSION = 3` |
| 宿主（0.2.0-rc.2） | **`SESSION_FORMAT_VERSION = 4`**（与 0.1.7-rc.2 相同） |

磁盘实证：`session.v3=27`、`session.jsonl=17`、`session.v2=14`、**`session.v4=7`**。
⇒ 0.2.0-rc.2 **没有**再迁移格式，`lib/features/session-log.js:15` 的正则
`/^session(?:\.v\d+)?\.jsonl(?:\.zstd)?$/` 继续覆盖 ⇒ **无需改动**。

### 4.4 宿主服务名（`ctx.get`）—— 全部存在

`subprocess` / `workspaceRegistry` / `sandboxPolicy` / `sessionQuery` / `sessionPersistence` /
`tools` / `agents` / `sessions` / `loader` / `webServer` / `agentDefaultModel`
逐一在宿主 `Context` 接口中确认存在。

### 4.5 客户端 slot 与 bundle

| 触点 | 判定 |
| --- | --- |
| `settings.section` / `shell.overlay` / `settings.plugins.tab` | ✅ 三个 slot 名在宿主 `dsh-client-ui-*` 中均仍被注册；`{name,id,order,label}` 形状不变 |
| `lib/client.js` 可重建性 | ✅ `npm run build:client` 产物 SHA256 **与提交版逐字节相同**（174 003 B） |
| 全 `lib/**/*.js` 语法 | ✅ `node --check` 0 个错误 |

## 5. 需要更新的三项

### 5.1 【P1 · 声明性】devDeps 落后一个 minor 世代（0.1.5-rc.1 → 0.2.0-rc.2）

```jsonc
// package.json L43-49（现状）
"devDependencies": {
  "@deepseek-ai/dsh-agent": "0.1.5-rc.1",
  "@deepseek-ai/dsh-llm": "0.1.5-rc.1",
  "@deepseek-ai/dsh-session": "0.1.5-rc.1",
  …
}
```

**为什么这是本轮唯一实质要更新的一项**：`bridge.js` 的三条 import 是**静态 ESM**
（模块求值期解析），解析到的是**工作区自己的 0.1.5-rc.1 副本**，不是宿主的 0.2.0-rc.2。
实测：

```text
@deepseek-ai/dsh-agent    0.1.5-rc.1   E:\Deepseek\PluginDevelop\node_modules\…
@deepseek-ai/dsh-llm      0.1.5-rc.1   E:\Deepseek\PluginDevelop\node_modules\…
@deepseek-ai/dsh-session  0.1.5-rc.1   E:\Deepseek\PluginDevelop\node_modules\…
```

即：**一个 0.1.5-rc.1 的 agent 协议实现被注册进 0.2.0-rc.2 的宿主进程**。
本轮已确认该错配**当前不产生可见故障**（§4.1 / §4.2 符号全在），但只要把 devDeps
对齐到 `0.2.0-rc.2` 并重装，`bridge.js` 的静态 import 就会自然改用宿主同版本代码 ——
**源文件一行都不用改**（导入路径与符号名两侧相同）。

### 5.2 【P2 · 观察】两个不可达文件引用了未声明依赖

`lib/wechat/vendor/weixin/entry.js:12` 与 `…/gateway.js:1` 分别 import
`@deepseek-ai/dsh-cmdline` 与 `@deepseek-ai/dsh-tools`，而二者**都不在** `package.json`
（devDeps 里没有 `dsh-tools`、`dsh-cmdline`）。

实测从插件目录解析：两者**均 `MODULE_NOT_FOUND`**（本机之所以不炸，是因为宿主
`E:\npm-global\node_modules\@deepseek-ai\dsh` 里恰好含有 `dsh-cmdline` 与 `dsh-tools`，
Node 逐级向上查找时命中了宿主树 —— **属于巧合，不是保证**）。

影响：**当前为零** —— 对 `lib/index.js` 做完整 ESM 可达性遍历（46 个文件）证明这两个
文件**不在任何运行路径上**（`vendor/weixin/` 下 12 个文件不可达，含 `entry.js`、
`gateway.js`、`driver.js`、`login-qr.js` 等）。活宿主上跑的是 `lib/wechat/gateway.js`
+ `lib/wechat/vendor/bridge.js`。

修法形状（择一）：把这两个文件挪出运行树 / 在 devDeps 补上两个包 / 接受其为死代码。
**不建议为它们单独发版**，随 §5.1 一起处理即可。

### 5.3 【P0 · 代码】`generate_image` 注册必失败（上轮已报，**仍未修**）—— 当前休眠

- 调用点：`lib/features/wechat-openclaw.js:449-463` 传**裸定义**
  `{name, description, parameters, execute}`，**没有 `output`**。
- 宿主 0.2.0-rc.2（`dsh-tools\lib\index.js`）**仍然强制**：
  ```js
  if (output === void 0 || typeof output !== "object" || typeof output.render !== "function" || …)
      throw new TypeError(`tool "${name}" must declare output { schema, render, presentationMeta? }`);
  ```
- ⇒ `register()` 抛 `TypeError` → 被 `:465-467` 的 `try/catch` **静默吞掉** →
  `generate_image` 永不注册，界面无任何提示。
- **休眠条件**：`if (getCapabilityConfig("image"))`（`:445`）。实测本机
  `~/.openclaw/weixin-dsh/.env` **只配了 ASR**（无 vision / image），故当前不触发；
  **一旦配置文生图就会静默失效**。
- **对照：同一工具的另一处注册是对的** —— `lib/wechat/vendor/weixin/gateway.js:15-29`
  用 `defineTool({…, output:{schema, render}})` 包装（**但该文件不可达**，见 §5.2）。
- 修法形状（**已在本轮后续的 v1.1.5 改动中实施**）：改用宿主导出的
  `defineTool({name, description, parameters, output, execute})` 包装，
  与 `vendor/weixin/gateway.js:15-29` 保持一致。**不要只手补 `output`** ——
  现有 `parameters`（`:452-458`）是**已编译的 JSON Schema**，而宿主
  `parameterSchemaSpecToJsonSchema()` 要求的是「紧凑参数表」
  `{prompt:{type,required,description}}`；把裸 JSON Schema 喂进去会抛
  `unsupported JSON schema: parameters.type must be a value schema object`。
  两处必须一起改，`defineTool()` 正好同时负责 output 守卫与参数编译。

  > **勘误**：本轮初稿曾把「旧 `parameters` 形状也不合法」写成被 `output` 掩盖的
  > **第二个缺陷**。核对宿主实现后确认：该守卫**只**检查 `output`，`parameters`
  > 不在 `register()` 的校验范围内，而是在**工具执行期**才走
  > `validateJsonSchemaValue` 校验。因此旧形状的真实症状是「注册失败」而非
  > 「注册成功但调用必坏」。结论不变（两处都要改），但归因需更正。

## 6. 既有缺陷（**不是**本次升级引入；上轮已报，仍未修）

| 编号 | 位置 | 症状 |
| --- | --- | --- |
| P1-A | `lib/index.js:163-168` `trustedHostsOf()` 判 `entry.options.name === "connection"` | 宿主该行 `name` 是模块指定符、`id` 才是行 id ⇒ 恒取不到 ⇒ **非回环访问全部 403**（本机回环看不出来） |
| P1-B | `lib/client/notify.js:108,139`、`delete-chat.js:180` 调 `ctx.sessions.open(id)` | 0.2.0-rc.2 的 `ISessions` **仍无 `open`**（只有 `list/retain/create/refresh/search/fork/scope/…`）⇒ 点通知只消失**不跳转**；导航语义现为 `openSession` |
| P1-C | `lib/client/notify.js:59` `useSessions(s => s.current)` | 宿主 `SessionListState` **无 `current`** ⇒ 过滤恒不成立 ⇒ 失焦时**每个会话**都弹通知 |
| P2 | `delete-chat.js` 调 `persistence.locate()` | 宿主类型里标 `private`，新公开替代为 `resolveCurrentLog(id, signal)` |
| P2 | `bridge.js` 用 `session.snapshotEvents()` | 宿主标 `@deprecated`（"new calls are prohibited"），**仍可用**，属技术债 |

> 这 5 条在 0.1.5-rc.1 上同样存在 ⇒ 与本次升级无关，但 **P0/§5.3 与它们叠加后**，
> 建议单独一轮清理。

## 7. 建议动作（按性价比排序）

| 优先级 | 动作 | 说明 |
| --- | --- | --- |
| **1** | devDeps `0.1.5-rc.1 → 0.2.0-rc.2`，重装，README 补 v1.1.3 说明 | 消除 §5.1 的"0.1.5 协议实现跑在 0.2.0 宿主里"错配；**零源码改动** |
| **2** | 修 §5.3 P0：给 `generate_image` 补 `output{schema,render}` | 唯一真实功能性缺陷；改动小、可精确验证；当前休眠但不修必踩 |
| **3** | 决定 §5.2 两个不可达文件（挪走 / 补依赖 / 认作死代码） | 依赖解析巧合，随手消除 |
| **4** | 修 §6 的 P1-A/B/C | 独立于版本升级的真 bug，建议单独一轮 |
| **5** | 发布 v1.1.3（工作树未发布改动） | v4 日志名兼容目前只存在于工作区 |

> 备注：本轮为**只读审计**（Mode A），未改动任何源码 / 依赖 / profile。
> 第 1、2 项要动手时按 plugin-upgrade 流程另出计划并征得确认。

## 8. 与之无关但影响本会话的一件事：Windows 权限

本轮开局两次 shell 全部 fail-closed（`SetNamedSecurityInfoW failed (Win32 5):
grantWrite(E:\Deepseek\PluginDevelop)`），连 `Get-Location` 都跑不了。按
`diagnose-windows-sandbox-acl` skill 的单一命令在**不受限**下诊断并修复：
根因是 `E:\Deepseek\PluginDevelop` 缺 **`WRITE_OWNER`**（`WRITE_DAC` 本来就有）。

- 备份：`E:\Deepseek\PluginDevelop-acl-recovery\acl-backup-944fa54e….json`（+ `.ps1`）
- 报告：`E:\Deepseek\PluginDevelop-acl-recovery\acl-report-a3c295e8….jsonl`
- 变更：仅给当前用户在该目录补一条 FullControl 允许项（**未动 owner、未删任何 deny、未递归**）
- 验证：`writeOwner: false → true`（`status: verified`），随后受限命令恢复正常
- 回滚：`pwsh -NoProfile -File 'E:\Deepseek\PluginDevelop-acl-recovery\acl-backup-944fa54e5e3843a886dcfdc1f26f8843.json.ps1' -Path 'E:\Deepseek\PluginDevelop' -AllowRoot 'E:\Deepseek\PluginDevelop' -Restore 'E:\Deepseek\PluginDevelop-acl-recovery\acl-backup-944fa54e5e3843a886dcfdc1f26f8843.json'`

## 9. 本轮新增的可复跑探针（只读）

`upgrade-report/` 下三个脚本，均为只读、可重复执行：

| 脚本 | 作用 |
| --- | --- |
| `probe-host-0.2.0-rc.2.mjs` | 对**宿主真实安装树**验证插件全部深 import 符号 |
| `probe-import-graph.mjs` | 遍历 `lib/index.js` 的完整 ESM 可达图，报告裸依赖可解析性 + vendor 可达性 |
| `probe-deep-import-diff.mjs` | 逐包比对"插件实际加载版 vs 宿主版"的导出表差异 |
| `probe-generate-image-def.mjs` | 用宿主原语验证 `generate_image` 定义形状（含旧形状负向对照） |

## 10. 落地记录（v1.1.5 · 按用户指示实施）

本节记录审计之后实际所做的改动（审计本身为只读）。提交 `cdeb531`，标签 **v1.1.5**。

### 10.1 改动清单

| 文件 | 改动 |
| --- | --- |
| `package.json` | version `1.1.2 → 1.1.5`；devDeps 对齐 `0.2.0-rc.2`（新增 `dsh-tools`、`dsh-cmdline`）；运行时宿主包补入 `peerDependencies`（`*` + optional） |
| `lib/features/wechat-openclaw.js` | `generate_image` 改用 `defineTool()`，补 `output{schema,render}`、`parameters` 改紧凑参数表；`catch` 由 `api.log` 提升为 `console.error` |
| `test/wechat-openclaw-smoke.mjs` | 新增定义形状回归（真实 `register()` 路径 + 宿主原语正反校验） |
| `README.md` | 新增 v1.1.5 更新说明；修正「新增工具想法」模板（旧模板正是静默失败的成因）；测试计数 十 → 十一 |
| `lib/features/session-log.js` 等 | 原 v1.1.3 工作树改动一并随本版发布 |

### 10.2 过程中发现的两件事（值得记下）

1. **沿用旧 `package-lock.json` 会 `ERESOLVE`**：`dsh-agent@0.2.0-rc.2` 等把
   `dsh-llm` / `dsh-session` / `dsh-scope` … 声明为**精确版本 peer**，旧锁里那棵树
   带的是 `^0.1.5-rc.1` 范围，接不了新版本。**必须删锁与 `node_modules` 重装**
   （`npm install --force` 会产出一棵坏树，不要用）。已写入 README 提示。
2. **回归测试的负向对照一开始写错了**：`validateJsonSchemaValue` 是**返回**违规数组、
   不抛异常；把「旧 `parameters` 形状」喂给 `validateArgs` 实际是**抛错**
   （`parameters.type must be a value schema object`）。据此更正了 §5.3 的勘误。
   负向对照经真实回放确认：把旧定义喂给新用例，确实红在
   `工具定义必须带 output（宿主强制）`。

### 10.3 验证记录

| 验证 | 结果 |
| --- | --- |
| 全部 11 个测试套件 | ✅ 全绿（`TOTAL FAILURES: 0`） |
| `node --check` 全 `lib/**/*.js` | ✅ 0 错误 |
| `npm run build:client` | ✅ 产物与提交版**逐字节一致**（174 003 B） |
| 深 import 实际解析版本 | ✅ 全部 `0.2.0-rc.2`，cordis `4.0.4`（与宿主一致，消除 §5.1 错配） |
| 活宿主全部路由 | ✅ ping / config / harness-check / plugin-catalog / usage/daily / plugin-toggle / update-plugin / delete-chat / wechat 全部 **200** |
| 负向对照（旧定义喂新用例） | ✅ 正确变红，证明回归有效 |

