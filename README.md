# dsh-tools

DSH web 插件：个人通用工具箱。一个插件收纳多个功能/工具想法，设置页
（设置 → **dsh 工具箱**）采用页签式导航：「功能开关」页签顶部为一键重启
（常驻，强制开启无开关）与桌面通知授权卡（任务完成提示开启时显示），
下方为可选功能的开关列表；每个已启用的可选功能一个页签入口（页签超出
宽度时可按住左右拖动查看）；开关即时生效并持久化（重启后保留）。

> ⚠️ **使用提示**：本插件纯 AI 制作，无人工含量，可能后续不会对其进行维护，请谨慎使用。

## 当前功能

| key | 功能 | 说明 | 默认 |
| --- | --- | --- | --- |
| `notify.task-done` | 任务完成提示 | 当前对话任务完成且网页未聚焦时，在 Windows 桌面右下角弹出系统提示框（置顶），点击跳回会话；开关关闭时不监听、不弹提示 | 开 |
| `restart.web` | 一键重启 dsh web | 「功能开关」页签顶部按钮：重启服务并自动刷新页面（开发测试快循环） | 强制开启（无开关） |
| `delete-chat` | 会话管理 | 归档会话查看（每次 dsh web 启动后首次打开自动加载，可手动刷新）、单条/批量删除会话；列表显示每个会话与工作区占用的磁盘空间；删除会话页点击工作区路径可打开对应文件夹 | 开 |
| `plugin-toggle` | 插件开关 | profile 已安装插件的启用/停用开关；点击插件名可跳转其 GitHub 页（有则显示），行内展示插件功能描述 | 开 |
| `update-plugin` | 更新检查 | 检查/更新/卸载 profile 已安装插件；支持 npm 注册表与 GitHub（`github:`/URL spec，Releases/tags API 探测）两类安装来源；点击插件名可跳转其 GitHub 页（有则显示）；每次 dsh web 启动后仅首次打开该页签时自动检查，之后需手动点「重新检查」 | 开 |
| `plugin-catalog` | 插件分类视图 | 「设置 → 插件」新增「插件分类」页签：官方（安装 Harness 自带）/ 已安装（插件市场 / GitHub / npm）/ 本地（link:/file: 开发）三个分类筛选浏览；开关关闭时页签自动消失 | 开 |
| `question.collapse` | 提问面板折叠 | agent 提问时（ask_user / plan 审批等）可在提问面板 header 内一键折叠为紧凑小条（回答草稿保留），再点展开 | 开 |
| `ui.enhance` | 界面增强 | 单一开关收纳：用户消息 Markdown 渲染（标题、列表、代码块、@子代理 / @技能 引用）+ 浮动历史条（悬停波浪高亮、点击跳转对应回合，支持「悬挂」；位置 / 数量在「界面增强」页签配置） | 关 |
| `ui.usage` | 应用用量 | 「应用用量」页签：按时间跨度（今年 / 本月 / 近 7 天 / 近 3 天）与模型过滤聚合各会话用量（Token、缓存命中、时长、会话 / 步数），趋势柱图与会话排行 | 关 |

## 融合功能与参考来源

融合了开源插件的功能（均 MIT 许可，源码文件头与下方条目标注来源；融合版
默认关闭，开启后行为与上游一致，但配置存 dsh-tools 自身的 `featureConfig`，
设置入口统一在「dsh 工具箱」内）：

| 功能 | 来源 | 许可 |
| --- | --- | --- |
| `question.collapse` 提问面板折叠 | [Townrain/dsh-question-panel-collapse](https://github.com/Townrain/dsh-question-panel-collapse) | MIT（Copyright (c) 2026 Townrain） |
| `ui.enhance`（Markdown 渲染 + 浮动历史条）/ `ui.usage` | [yoli-mi/dsh-client-ui-custom](https://github.com/yoli-mi/dsh-client-ui-custom) | MIT（Copyright (c) 2026 Yoli-mi） |

> 说明：ui-custom 的 `appearance`（外观）、`shortcuts`（快捷键）与
> `marketplace`（插件市场）模块未融合。

## 安装

dsh-tools 是 DSH web profile 的常驻插件（bundle 插件）。傻瓜式安装，一条命令：

```bash
dsh plugin --profile web add dsh-tools
```

该命令自动完成：依赖安装（npm 官方源分发）+ 激活层写入（`dsh.profile.bundles`）。
执行后**重启 dsh web**，从 设置 →「dsh 工具箱」管理各功能开关。

> 提示：裸 `pnpm add` / `npm i` 只安装依赖、**不会激活插件**（依赖 ≠ 激活）；
> 激活靠 `dsh.profile.bundles` 列表，`dsh plugin add` 会自动写入。

已装有 dsh-tools 且依赖 spec 为 `github:` 形式的环境，更新检查页签会通过
GitHub Releases/tags API 自动检测本仓库新版本并一键更新（更新会固定到 `#tag`）。

## 配置

私有 JSON：`<DSH_HOME>/profiles/web/plugins-data/dsh-tools.json`（首次修改
时自动生成，写入前自动备份 `.bak`）。结构为
`{ "features": { "<key>": true|false }, "featureConfig": { "<key>": {...} } }`：
缺失的 key 一律回落到功能默认值（带默认配置的功能，其 `featureConfig`
在读取时自动与模块 `defaultConfig` 合并）。

## 宿主 API（同源 + 信任围栏，POST 除注明外）

框架路由：

- `POST /dsh-tools/api/config` — 配置快照（全部功能的元数据 + 开关 + featureConfig）
- `POST /dsh-tools/api/config/set` `{key, enabled}` — 改开关，写盘并热应用
- `POST /dsh-tools/api/config/feature` `{key, config}` — 写某功能的配置项（与模块默认值合并后写盘；客户端据此实时渲染）
- `POST /dsh-tools/api/ping` — 健康检查（客户端重启探测用）
- `POST /dsh-tools/api/restart` — 重启 dsh web（`restart.web` 启用时）
- `POST /dsh-tools/api/plugin-catalog` — 插件分类投影：loader 条目 + 来源分类（`plugin-catalog` 启用时；分类规则见 `lib/features/plugin-catalog.js`）
- `GET  /dsh-tools/api/events` — SSE 推送（`notify.task-done` 启用时）

合并功能路由（对应功能启用时注册）：

- `POST /dsh-tools/delete-chat/api/{list,delete}`
- `POST /dsh-tools/plugin-toggle/api/{list,set}`
- `POST /dsh-tools/update-plugin/api/{check,update,uninstall}`

SSE 消息格式：`data: {"type":"turn-done","data":{"sessionId":"..."}}`。

## 新增一个「工具想法」

1. 在 `lib/features/` 下新建 `<key>.js`：

```js
export const key = "my.idea";            // 唯一 key，同时是开关存储键
export const label = "我的新功能";        // 设置页显示名
export const description = "一句话说明这个功能做什么";
export const defaultEnabled = true;      // 首次启用的默认开关
export const kind = "tool";              // "tool"=模型工具 | "feature"=UI/服务类

// 注册逻辑；宿主在开关开启时调用，关闭时调用返回的 disposer。
// ctx 为宿主 Cordis 上下文；api 提供 config()/featureEnabled()/broadcast()/
// fence/writeOk/writeError/readJsonBody/log。
export function register(ctx, api) {
  // 例：注册一个模型工具
  const tools = ctx.get("tools");
  if (tools === undefined) return () => {};
  const dispose = tools.register({
    name: "my_tool",
    description: "…",
    parameters: { type: "object", properties: {}, required: [] },
    execute: async () => ({ ok: true }),
  });
  return () => dispose();
}

// 可选：贡献 POST 方法到 /dsh-tools/api/<方法名>
export const methods = {
  "my/action"(req, res, api, payload) {
    api.writeOk(res, { ok: true });
  },
};
```

2. 在 `lib/features/index.js` 里 import 一行并加入 `FEATURES` 数组。
3. 重启 dsh web（用设置页「功能开关」页签顶部的一键重启按钮最快），新功能即出现在
   dsh 工具箱设置页并带开关。

## 一键重启的实现说明

`restart.web` 捕获当前进程的 `process.argv` / env / cwd，落盘一个
PowerShell 延迟启动器（`dsh-tools-restart-launcher.ps1` + 同名 `.cmd`），
由 **explorer.exe 分发执行**——启动器链完全脱离服务器进程树，因此不
受服务器所在 kill-on-close job 的连坐清除（直接由服务器派生子进程的
方案实测会在 Start-Process 之前被连坐杀死）。启动器等待 2s 规避端口
占用竞态后 `Start-Process` 拉起原命令，先回包、600ms 后退出当前进程；
客户端轮询 `ping`，服务恢复即 `location.reload()`。

关键实现细节（均由 `test/restart-launcher-smoke.mjs` 用真实生成器文本
验证）：

- 启动器以**单字符串** `-ArgumentList` 传参并手工按 CommandLineToArgvW
  规则加引号（Windows PowerShell 5.1 的数组形式不会给含空格元素加引号，
  会导致参数截断）；try/catch 保持在单行（`}; catch` 是解析错误）；
- 全流程取证落盘在 `<DSH_HOME>/profiles/web/plugins-data/`：
  `dsh-tools-restart-capture.json`（argv/env 快照）、`-ran.log`、
  `-ok.log`、`-failed.log`、`-restart.log`（错误）、`-port-up/down.log`
  （端口存活探测）。新进程日志直接输出到它自己的控制台窗口。

仅支持 Windows；桌面端环境优先走 `window.dshDesktop.restartService()` 桥。
新进程会在一个独立的控制台窗口中运行（日志直接可见、可随时关闭）。依赖
explorer.exe 常驻（交互式桌面的常态）。若重启仍失败，把上述日志文件
发来即可定位。

## 测试

```sh
node test/smoke.mjs            # 宿主框架：启动/配置热应用/SSE 管线/围栏/方法门控/featureConfig 路由/插件分类路由
node test/plugin-catalog-smoke.mjs  # 插件分类：分类判定纯函数（scope/spec/余量桶/投影）
node test/client-smoke.mjs     # 客户端 bundle：执行/槽位注册/初始渲染/提示判定/标签页模型/用量与外观纯函数
node test/mutations-smoke.mjs  # profile 文件改写（plugin-toggle / update-plugin，假 profile）
node test/update-github-smoke.mjs   # GitHub 安装来源：spec 分类/解析/版本探测/检查流程（假 profile）
node test/restart-launcher-smoke.mjs  # 一键重启启动器（真实生成器文本，无害载荷）
node test/explorer-dispatch-smoke.mjs # explorer 分发链（cmd→隐藏 powershell）
node test/restart-sequence-smoke.mjs  # 真实 restart 方法：响应+自退出（一次性牺牲进程）
```

八个测试都不需要真实服务器，全部在临时目录下运行（通过临时 `DSH_HOME`
隔离；仅 `client-smoke.mjs` 以只读方式解析真实 profile 中的 react 用于
可选的服务端渲染，其余测试绝不触碰真实 profile）。注意：
`restart-sequence-smoke.mjs` 的"复活进程"阶段在 DSH agent 沙箱内无法
完成 explorer 分发链而跳过——在普通终端运行该测试会完整断言整条重生链。

## 任务完成提示（桌面通知）说明

页面未聚焦时，任务完成提示优先使用浏览器的 **Notification API** ——
Windows 会把它渲染成屏幕右下角**置顶**的系统提示框，点击回到会话。
首次使用需要在「dsh 工具箱」设置页点击一次「授权桌面通知」；浏览器
必须保持打开（页面级通知不注册 Service Worker）。权限被拒时回退为
页面内提示框（页面未聚焦时不可见）。Windows「专注助手」开启时系统
可能吞掉通知。

## 已知边界

- 多标签页各自弹各自的任务完成提示；
- 子代理完成不提示（宿主按根 Agent 过滤）；
- 桌面通知依赖浏览器打开并已授权（设置页有授权按钮）；
- 重启按钮依赖当前进程以 `dsh web` 直接启动（npm 包装器等父子进程
  场景下重生的新窗口可能不受原包装器管理）。
