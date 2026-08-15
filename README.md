# dsh-tools

DSH web 插件：个人通用工具箱。一个插件收纳多个功能/工具想法，设置页
（设置 → **dsh 工具箱**）采用页签式导航：「功能开关」页签顶部为常驻功能
（一键重启、桌面通知授权，强制开启无开关），下方为可选功能的开关列表；
每个已启用的可选功能一个页签入口（页签超出宽度时可按住左右拖动查看）；
开关即时生效并持久化（重启后保留）。

## 当前功能

| key | 功能 | 说明 | 默认 |
| --- | --- | --- | --- |
| `notify.task-done` | 任务完成提示 | 当前对话任务完成且网页未聚焦时，在 Windows 桌面右下角弹出系统提示框（置顶），点击跳回会话 | 强制开启（无开关） |
| `restart.web` | 一键重启 dsh web | 设置页按钮：重启服务并自动刷新页面（开发测试快循环） | 强制开启（无开关） |
| `delete-chat` | 会话管理 | 归档会话查看、单条/批量删除会话（合并自 dsh-delete-chat） | 开 |
| `plugin-toggle` | 插件开关 | profile 已安装插件的启用/停用开关（合并自 dsh-plugin-toggle） | 开 |
| `update-plugin` | 更新检查 | 检查并更新 profile 已安装插件（合并自 dsh-update-plugin） | 开 |

## 配置

私有 JSON：`<DSH_HOME>/profiles/web/plugins-data/dsh-tools.json`（首次修改
时自动生成，写入前自动备份 `.bak`）。缺失的 key 一律回落到功能默认值。

## 宿主 API（同源 + 信任围栏，POST 除注明外）

框架路由：

- `POST /dsh-tools/api/config` — 配置快照（全部功能的元数据 + 开关）
- `POST /dsh-tools/api/config/set` `{key, enabled}` — 改开关，写盘并热应用
- `POST /dsh-tools/api/ping` — 健康检查（客户端重启探测用）
- `POST /dsh-tools/api/restart` — 重启 dsh web（`restart.web` 启用时）
- `GET  /dsh-tools/api/events` — SSE 推送（`notify.task-done` 启用时）

合并功能路由（对应功能启用时注册）：

- `POST /dsh-tools/delete-chat/api/{list,delete}`
- `POST /dsh-tools/plugin-toggle/api/{list,set}`
- `POST /dsh-tools/update-plugin/api/{check,update}`

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
3. 重启 dsh web（用设置页的一键重启按钮最快），新功能即出现在
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
node test/smoke.mjs            # 宿主框架：启动/配置热应用/SSE 管线/围栏/方法门控
node test/client-smoke.mjs     # 客户端 bundle：执行/槽位注册/初始渲染/提示判定逻辑
node test/mutations-smoke.mjs  # 合并 plugin-toggle 的 profile 文件改写（假 profile）
node test/restart-launcher-smoke.mjs  # 一键重启启动器（真实生成器文本，无害载荷）
node test/explorer-dispatch-smoke.mjs # explorer 分发链（cmd→隐藏 powershell）
node test/restart-sequence-smoke.mjs  # 真实 restart 方法：响应+自退出（一次性牺牲进程）
```

六个测试都不需要真实服务器，全部在临时目录下运行（通过临时 `DSH_HOME`
隔离，绝不触碰真实 profile）。注意：`restart-sequence-smoke.mjs` 的
"复活进程"阶段在 DSH agent 沙箱内无法完成 explorer 分发链而跳过——
在普通终端运行该测试会完整断言整条重生链。

## 迁移说明（合并旧本地插件）

迁移已完成：三个旧插件（`dsh-delete-chat` / `dsh-plugin-toggle` /
`dsh-update-plugin`）已**彻底卸载删除**——依赖、junction、源码目录均已
移除，行为由 dsh-tools 的合并功能承接。时间戳备份保留在
`plugins-backup\`，如需回退：从备份恢复源码 → 重新
添加 `link:` 依赖 + 激活行 → 重启。

## 任务完成提示（桌面通知）说明

页面未聚焦时，任务完成提示优先使用浏览器的 **Notification API** ——
Windows 会把它渲染成屏幕右下角**置顶**的系统提示框，点击回到会话。
首次使用需要在「dsh 工具箱」设置页点击一次「授权桌面通知」；浏览器
必须保持打开（页面级通知不注册 Service Worker）。权限被拒时回退为
页面内提示框（页面未聚焦时不可见）。Windows「专注助手」开启时系统
可能吞掉通知。

## 已知边界（v1）

- 多标签页各自弹各自的任务完成提示；
- 子代理完成不提示（宿主按根 Agent 过滤）；
- 桌面通知依赖浏览器打开并已授权（设置页有授权按钮）；
- 重启按钮依赖当前进程以 `dsh web` 直接启动（npm 包装器等父子进程
  场景下重生的新窗口可能不受原包装器管理）。
