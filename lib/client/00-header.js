/**
 * dsh-tools — browser half (classic client bundle).
 *
 * 注册两块 UI：
 *   - settings.section id `dsh-tools`：「dsh 工具箱」设置页 —— 全部功能
 *     开关 + 一键重启 dsh web + 已启用合并功能的操作面板（会话管理、
 *     插件开关、更新检查，均迁自旧本地插件）;
 *   - shell.overlay id `dsh-tools-notify`：右下角任务完成提示框，
 *     订阅宿主 SSE /dsh-tools/api/events。
 * 配置读写走宿主同源 JSON API /dsh-tools/api/{config,config/set,ping,restart}；
 * 合并功能面板走各自的 /dsh-tools/<feature>/api 前缀。
 */
