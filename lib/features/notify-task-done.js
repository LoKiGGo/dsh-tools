/**
 * Feature: notify.task-done — 任务完成提示（宿主半边）。
 *
 * 监听 agent/status：根 Agent 回到 idle（一个对话回合结束、无任何
 * driver 活动）即通过宿主 SSE 频道广播 turn-done。子代理的 idle
 * 被过滤（agents.roots()），避免提示噪音。客户端负责焦点检查，并在
 * 页面未聚焦时弹出 Windows 桌面级系统通知（屏幕右下角置顶），
 * 权限被拒时回退为页面内提示框。
 */

export const key = "notify.task-done";
export const label = "任务完成提示";
export const description = "当前对话任务完成且网页未聚焦时，在 Windows 桌面右下角弹出系统提示框（点击跳回会话）";
export const defaultEnabled = true;
export const alwaysOn = true; // 常驻功能：无开关，强制启用
export const kind = "feature";

export function register(ctx, api) {
  const agents = ctx.get("agents");

  const isRootAgent = (agent) => {
    if (agents === undefined) return true; // 服务缺失时降级为接受所有
    try {
      return agents.roots().includes(agent);
    } catch {
      return true;
    }
  };

  const handle = (payload) => {
    if (payload === undefined || payload.status !== "idle") return;
    const agent = payload.agent;
    if (agent === undefined || agent.id === undefined) return;
    if (!isRootAgent(agent)) return;
    api.broadcast("turn-done", { sessionId: String(agent.id) });
  };

  const off = ctx.on("agent/status", handle);
  api.log("notify.task-done active");

  return () => {
    if (typeof off === "function") off();
  };
}
