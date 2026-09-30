# dsh-tools ↔ DeepSeek Harness 版本兼容审计（只读）

- 审计对象：`dsh-tools` v1.1.1（workspace：`E:\Deepseek\PluginDevelop`，GitHub: LoKiGGo/dsh-tools）
- 审计基准（用户指定）：本机正在运行的 DeepSeek Harness 宿主
- 方式：只读（未改动 dsh-tools 任何源码 / 配置 / 依赖）
- 日期：2026-08-28（会话记录）

## 1. 结论摘要

| 项 | 结论 |
| --- | --- |
| dsh-tools 声明/开发基准 | DeepSeek Harness **0.1.2-rc.1**（devDependencies + README v1.1.1） |
| 本机实际运行宿主核心 | **0.1.2-rc.1**（嵌套依赖全量采样一致，见 §2） |
| 兼容判定 | ✅ **一致 —— 无需为适配当前宿主而更新 dsh-tools** |
| 非阻塞观察项 | 2 项（§6），均为"可选改进"，不构成必须更新 |

一句话：dsh-tools v1.1.1 的"基于 rc.1"与当前宿主真实运行的核心版本（rc.1）**完全对齐**；
表面上看到的 `0.1.2-alpha.5` 只是本机安装的 CLI 包装壳（`@deepseek-ai/dsh`）版本，
其嵌套依赖（即真正提供宿主 API 的 dsh-base / dsh-web-app / dsh-agent / dsh-session / dsh-llm /
dsh-host-webserver / cordis 等）全部为 0.1.2-rc.1。

## 2. 版本事实（证据）

### 2.1 版本分层

| 层 | 包 | 版本 | 位置 / 证据 |
| --- | --- | --- | --- |
| L0 CLI 包装壳 | `@deepseek-ai/dsh` | **0.1.2-alpha.5** | `E:\npm-global\node_modules\@deepseek-ai\dsh\package.json`（version 字段） |
| L1 宿主核心（运行时代码） | `@deepseek-ai/dsh-base` | **0.1.2-rc.1** | 同上目录 `node_modules\@deepseek-ai\dsh-base\package.json` |
| L1 | `@deepseek-ai/dsh-web-app` | 0.1.2-rc.1 | `…\dsh\node_modules\@deepseek-ai\dsh-web-app\package.json` |
| L1 | `@deepseek-ai/dsh-agent` | 0.1.2-rc.1 | `…\dsh\node_modules\@deepseek-ai\dsh-agent\package.json` |
| L1 | `@deepseek-ai/dsh-session` | 0.1.2-rc.1 | `…\dsh\node_modules\@deepseek-ai\dsh-session\package.json` |
| L1 | `@deepseek-ai/dsh-llm` | 0.1.2-rc.1 | `…\dsh\node_modules\@deepseek-ai\dsh-llm\package.json` |
| L1 | `@deepseek-ai/dsh-host-webserver` | 0.1.2-rc.1 | `…\dsh\node_modules\@deepseek-ai\dsh-host-webserver\package.json` |
| L1 | `@deepseek-ai/dsh-client-ui-cordis` | 0.1.2-rc.1 | `…\dsh\node_modules\@deepseek-ai\dsh-client-ui-cordis\package.json` |
| L1 | `@deepseek-ai/cordis` | 4.0.2 | `…\dsh\node_modules\@deepseek-ai\cordis\package.json` |
| L2 被审计插件 | `dsh-tools` | 1.1.1 | workspace `package.json` |
| L3 安装形态 | profile web | `link:E:/Deepseek/PluginDevelop` | `C:\Users\13768\.dsh\profiles\web\package.json`（bundles 含 `dsh-tools`） |

### 2.2 为何 CLI 壳 alpha.5 与核心 rc.1 共存是合法的

- semver 预发布序：`0.1.2-alpha.5 < 0.1.2-rc.1 < 0.1.2`。
- `@deepseek-ai/dsh@0.1.2-alpha.5` 的依赖范围是 `^0.1.2-alpha.5`
  （= `>=0.1.2-alpha.5 <0.2.0`），**rc.1 落在范围内**，安装一致、无破损。
- 因此"本机 DeepSeek Harness"是 **alpha.5 壳 + rc.1 核心**；宿主 API 形态由 L1 核心决定，
  与 dsh-tools 开发对齐目标（rc.1）相同。

### 2.3 dsh-tools 的"基于 rc.1"证据

- `package.json` devDependencies：`@deepseek-ai/dsh-agent / dsh-llm / dsh-session = 0.1.2-rc.1`；
  peer `@deepseek-ai/cordis ^4.0.1`（宿主为 4.0.2，满足）。
- README「v1.1.1 更新」：*"更新兼容 DeepSeek Harness 0.1.2-rc.1（devDependencies 对齐到 0.1.2-rc.1）"*；
  微信 AgentBridge 已适配 `session.snapshotEvents()`（宿主移除 `Session.events`，DSH ≥ 0.1.2-alpha.4 提供）。
- 代码实际调用 `agent.session.snapshotEvents()`（`lib/wechat/vendor/bridge.js` L100/L160），
  宿主 rc.1 的 `dsh-session` 确实导出 `Session.snapshotEvents()`（`…\dsh-session\lib\index.js` L1342、导出表 L1850）。

## 3. dsh-tools → 宿主 API 触点清单（静态盘点）

| # | 触点 | 插件侧用法 | 宿主 rc.1 侧提供 | 判定 |
| --- | --- | --- | --- | --- |
| T1 | cordis bundle patch | `cordis.patch.yml`：`- insert: - id: dsh-tools`；profile `dsh.profile.bundles` 含 `dsh-tools` | 宿主 cordis loader 按 bundle 激活 | ✅ 当前即存活运行 |
| T2 | `ctx.webServer.register({kind:"prefix", path, handler})` | `lib/index.js` L302（`/dsh-tools/api`）+ 功能路由：delete-chat L446、wechat.openclaw L368、plugin-toggle L314、update-plugin L388 | `dsh-host-webserver` `register(route)`：非 `exact` 一律进 prefixes 表，最长前缀匹配（`lib/index.js` L176/L321） | ✅ kind/path/handler 契约吻合 |
| T3 | `ctx.loader.entries()` | `lib/index.js` L164（trustedHostsOf）；`lib/features/plugin-catalog.js` L132（catalogSnapshot：entry.options.name/group/disabled/id/fiber） | cordis-plugin-loader entries | ✅ |
| T4 | `ctx.effect()` | `lib/index.js` L283/L302（SSE 心跳 + 路由注册生命周期） | cordis ctx 生命周期 | ✅ |
| T5 | 核心服务 `ctx.get('agents'/'agentDefaultModel'/'sessions'/'loader')` | `lib/wechat/vendor/bridge.js` L52-58（resolveAgentOptions） | dsh-base 注入同名服务 | ✅（微信功能开启时才触达，见 §6 敏感面） |
| T6 | 深 import 宿主包 | `dsh-agent` `installModelSelection`（bridge L12）、`dsh-llm` `createUserMessage`（bridge L14）、`dsh-session` `SessionId`（bridge L15）、`dsh-cmdline` `parseCmdline`（weixin/entry.js L12）、官方 `@deepseek-ai/dsh-tools` `defineTool`（weixin/gateway.js L1） | 全部在宿主 rc.1 中导出（§4 实证） | ✅ |
| T7 | 会话事件 API | `agent.session.snapshotEvents()`（bridge L100/L160） | dsh-session rc.1 `Session#snapshotEvents` | ✅ |
| T8 | 客户端宿主面 | `window.dshDesktop.restartService()`（桌面桥，有 `typeof` 守卫；client.js L1943/L1967、settings.js L126/L150）；`settings.section` + `useSessions` 运行时 props（client/apply.js 等）；SSE `GET /dsh-tools/api/events` | rc.1 web 宿主注入（设置页 section 已在本会话 GUI 挂载） | ✅（运行证据见 §7 补充） |
| T9 | 信任围栏 | loopback/trustedHosts 校验（`lib/index.js` L117-168，`ctx.loader` 的 `connection` 条目 `config.trustedHosts`） | loader entries 配置树 | ✅ |

插件主体（`lib/` 宿主半边）除上述深 import 外**不直接引用任何 `@deepseek-ai/*` 模块**
（纯 cordis ctx 注入 + 自有 HTTP），因此宿主核心版本漂移的风险集中在 T5-T7（微信功能）与
客户端宿主面（T8）。

## 4. 宿主 rc.1 导出实证（符号级）

对 `E:\npm-global\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\` 下宿主包 grep：

- `dsh-agent`：`export { …, installModelSelection, … }`（lib/index.js L795）
- `dsh-session`：`SessionId`（lib/index.js L13）、`snapshotEvents(fromSeq, toSeqExclusive)`（L1342）、导出表 L1850
- `dsh-llm`：`createUserMessage`（lib/index.js L48，导出表 L1758）
- `dsh-cmdline`：`parseCmdline`（lib/index.js L91/L152）
- 官方 `@deepseek-ai/dsh-tools`：`defineTool`（lib/index.js L837/L3589）
- `dsh-host-webserver`：`register(route)`（lib/index.js L176），kind 非 exact 走 prefixes 表（L148/L321）

全部与 dsh-tools 使用方式匹配。

## 5. 更新判定

**判定：不需要更新。** 判定依据：

1. dsh-tools 声明的开发基准（rc.1）== 本机宿主真实运行核心（rc.1）；
2. §3 全部触点（T1-T9）在宿主 rc.1 中均有对应且契约吻合（§4 符号实证）；
3. 插件当前就以 link 形态运行在该宿主上（profile bundles 激活），启动即加载成功。

若按"CLI 壳 alpha.5"字面比较（`alpha.5 < rc.1`），会得出 dsh-tools"领先宿主一个版本"的假象——
这是**包装分层**（§2.2），不是兼容差距。把 devDependencies 从 rc.1 改回 alpha.5 反而是降级，不可取。

## 6. 观察项与可选改进（非阻塞，需单独确认后才动代码）

- **O1（建议）版本发现分层误导**：`lib/features/harness-check.js` 的 `discoverHarnessVersion()`
  从 execPath / argv[1] / `npm root -g` 读 `@deepseek-ai/dsh/package.json`（L36-60），
  在本部署会得到 **CLI 壳 alpha.5**，而真实核心是 rc.1。其卡片/`outdated` 语义（L94）按
  `compareVersions(current, latest)` 与 GitHub 最新 tag 比较时，会在 rc.1 宿主上把自身报成
  "旧版本"，产生误导（该处另有 prerelease 段比较的语义噪音：`0.1.2-rc.1` 与 `0.1.2` 正式版比较）。
  可选改进：优先读取宿主核心包的版本（如 profile 依赖树中 `@deepseek-ai/dsh-web-app` 或 loader
  内 `@deepseek-ai/dsh-base` 的 package.json），并/或在 UI 上区分「CLI 壳 / 核心」两个版本号。
  影响面小（一个 feature + 单测 `test/harness-check-smoke.mjs`）。
- **O2（备忘）未来 >rc.1 升级的敏感面**：宿主再发新训练（0.1.2 正式或 0.1.x）时，回归重点 =
  T5-T7（wechat bridge 深 import + `snapshotEvents` 事件词汇）、T2（webServer.register 路由
  契约）、T8（客户端 `settings.section` / `useSessions` / SSE）、T3（loader entries 形态）。
  对应测试套件已在仓库中：`test/harness-check-smoke.mjs`、`test/plugin-catalog-smoke.mjs`、
  `test/update-github-smoke.mjs`、`test/mutations-smoke.mjs`、`test/restart-*-smoke.mjs` 等。
- **O3（备忘）发布节奏**：本次审计范围按用户决定不含 GitHub/npm 远端最新版探测；若上游已有
  高于 rc.1 的发布，再做一次 `dsh-upgrade-audit` 走廊式审计即可（本地目前无 >rc.1 源码可对照）。

## 7. 附录：被审计对象版本速查

- dsh-tools：1.1.1（devDeps：dsh-agent/dsh-llm/dsh-session 0.1.2-rc.1；peer cordis ^4.0.1）
- 宿主：`@deepseek-ai/dsh` 0.1.2-alpha.5（CLI 壳）/ 核心 0.1.2-rc.1 / cordis 4.0.2
- 安装：profile web `dsh-tools: link:E:/Deepseek/PluginDevelop`（bundles 激活）

## 8. 运行证据（实机只读探测）

- **安装形态**：`C:\Users\13768\.dsh\profiles\web\node_modules\dsh-tools` = Junction → Target
  `E:\Deepseek\PluginDevelop`（工作区即活代码，与 dsh-plugins-develop 部署记录一致）。
- `POST /dsh-tools/api/ping` → `{"ok":true,"value":{"ok":true,"pong":…}}`（宿主半边已挂载并响应）。
- `POST /dsh-tools/api/config` → 9 个 feature 全部 enabled（notify.task-done / restart.web /
  delete-chat / plugin-toggle / update-plugin / plugin-catalog / harness.check / ui.usage /
  wechat.openclaw）。
- `POST /dsh-tools/api/harness-check` →
  `{"current":"0.1.2-alpha.5","latest":"0.1.3-alpha.1","outdated":true,"error":""}`
  - 实锤 §6-O1：`current` 读到的是 **CLI 壳版本 alpha.5**（发现链命中 argv/npm root -g 的
    `@deepseek-ai/dsh`），而宿主核心代码 = rc.1 —— 版本卡片在本机展示的是壳版本。
  - 顺带观测：GitHub 最新 tag 已是 **0.1.3-alpha.1**（> rc.1），超出本次用户选定基准，见 §10。
- git 身份：HEAD `d0bf905` = tag `v1.1.1`（master / origin/master 同步）；工作树 30 个文件
  "modified" 经核实为**纯行尾/空白差异**（numstat 增删完全对称，如 README 308/308、
  lib/client.js 3202/3202；`git diff --ignore-all-space` 为空），无内容漂移；本次审计未改动任何文件。

## 9. 上游走廊卡证据（plugin-upgrade skill references，独立复核）

- **alpha.5 → rc.1**（`references/v0.1.2-rc.1.md`，status: reviewed）：**zero cards** —— 两 tag 相距
  2 commits，252 个文件改动全部是 `package.json` version bump（0.1.2-alpha.5 → 0.1.2-rc.1），
  无任何插件面源码变化；npm 通道：`next` = rc.1、`alpha` = alpha.5。
- **alpha.4 → alpha.5**（`references/v0.1.2-alpha.5.md`）：3 张卡全部落在宿主**存储域层**
  （`compatibleVersions` / `invalidRecords: backup-and-skip` / projcache 三代修复）；
  dsh-tools 不使用 storage-domain API（自有 JSON 配置持久化），零命中。
- **alpha.4 卡**（`references/v0.1.2-alpha.4.md`）：`Session.events` 被 `seq`/`eventAt()`/
  `snapshotEvents()` 取代 —— 正是 dsh-tools v1.1.1 changelog 的适配点，已按 rc.1 适配。
- **推论**：即便把"当前版本"解读为 alpha.5 训练，alpha.5 与 rc.1 **代码等价**（纯版本号提升），
  dsh-tools 的 rc.1 对齐对两种解读都成立 —— §5 判定在两种解释下结论一致。

## 10. 范围外观察（不参与判定）

- 实机端点观测到 GitHub 最新 release/tag = `0.1.3-alpha.1`（高于 rc.1）。用户本轮选定基准为
  「仅本机宿主」，故不纳入判定。
- 若后续要以 0.1.3-alpha.1（或更高）为目标：plugin-upgrade references 尚无 0.1.3 走廊卡
  （已维护卡集上界 = rc.1），属 unsupported gap，需从 exact-tag 源码核对后另起
  dsh-upgrade-audit / plugin-upgrade Mode C 流程 —— 本轮不执行。

## 11. 工作区 git 状态说明（plugin-upgrade Mode A 核查项）

HEAD `d0bf905`（v1.1.1）与 origin 同步；`git status` 的 30 个 modified 文件经核实为
**CRLF/LF 行尾归一化噪音**（内容零差异），审计全程只读、未改动任何源码/配置/依赖。

> 备注：本报告为只读审计产物（plugin-upgrade Mode A：inspect 后停止）。O1 与未来 0.1.3
> 走廊如要实施（写代码 / 依赖变更 / 发布），将按 plugin-upgrade / plugin-release 流程
> 另行给出计划并征得确认。
