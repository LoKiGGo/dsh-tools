/**
 * Feature: restart.web — 一键重启 dsh web（宿主半边）。
 *
 * 提供 POST /dsh-tools/api/restart：捕获当前进程的 argv/env/cwd，
 * 落盘一个 PowerShell 延迟启动器（launcher.ps1）和一个 cmd 入口
 * （launcher.cmd），再由 explorer.exe 分发执行——启动器链完全脱离
 * 服务器进程树（服务器自身处于 kill-on-close job 中，其子进程会在
 * 服务器退出时被连坐清除，经验证：直接派生 PowerShell 启动器会在
 * Start-Process 之前死亡）。启动器等待 2s 规避端口占用竞态后
 * Start-Process 拉起原命令，先回包、约 600ms 后退出当前进程。
 *
 * 全流程取证（均落在 <DSH_HOME>/profiles/web/plugins-data/）：
 *   - dsh-tools-restart-capture.json  点击时的 argv/env 快照
 *   - dsh-tools-restart-ran.log       启动器已醒
 *   - dsh-tools-restart-ok.log        Start-Process 已返回
 *   - dsh-tools-restart.log           启动器错误
 *   - dsh-tools-restart-failed.log    Start-Process 抛错标记
 *   - dsh-tools-restart-port-up/down.log   端口存活探测
 * 新进程的日志直接输出到它自己的控制台窗口（不重定向）。
 *
 * 注意：仅支持 Windows 部署；桌面端环境由客户端优先走
 * window.dshDesktop.restartService() 桥。
 */

import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const key = "restart.web";
export const label = "一键重启 dsh web";
export const description = "设置页提供重启 dsh web 服务并自动刷新页面的按钮（插件开发测试快循环）";
export const defaultEnabled = true;
export const alwaysOn = true; // 常驻功能：无开关，强制启用
export const kind = "feature";

const WAIT_MS = 2000; // 新进程启动前等待，等待旧进程释放端口
const EXIT_MS = 600; // 回包后延迟退出，保证响应送达
const CHECK_MS = 4000; // 启动后端口存活探测的等待

let restarting = false;

/** PowerShell 单引号字符串转义。 */
function psQuote(value) {
  return String(value).replace(/'/g, "''");
}

/**
 * Quote one argv element for a Windows command line (CommandLineToArgvW
 * rules): double every backslash, escape embedded double quotes, wrap in
 * quotes. Windows PowerShell 5.1's Start-Process -ArgumentList array form
 * does NOT quote elements containing spaces, so the launcher passes ONE
 * pre-quoted command-line string instead.
 */
function quoteArgForCmd(value) {
  let s = String(value);
  s = s.replace(/\\/g, "\\\\");
  s = s.replace(/"/g, '\\"');
  return '"' + s + '"';
}

/** 方法型功能：无宿主侧常驻注册，仅贡献 restart POST 方法。 */
export function register(ctx, api) {
  api.log("restart.web active");
  return () => {};
}

/**
 * Build the launcher file contents for one restart. Exported as a pure
 * function so the smoke tests can exercise the exact production text with a
 * harmless payload.
 *
 * @param opts - { node, args, cwd, port, env, dir }
 * @returns { files, ps1Content, cmdContent }
 */
export function buildLauncherFiles(opts) {
  const dir = opts.dir;
  const files = {
    capture: join(dir, "dsh-tools-restart-capture.json"),
    ps1: join(dir, "dsh-tools-restart-launcher.ps1"),
    cmd: join(dir, "dsh-tools-restart-launcher.cmd"),
    ran: join(dir, "dsh-tools-restart-ran.log"),
    ok: join(dir, "dsh-tools-restart-ok.log"),
    failed: join(dir, "dsh-tools-restart-failed.log"),
    error: join(dir, "dsh-tools-restart.log"),
    portUp: join(dir, "dsh-tools-restart-port-up.log"),
    portDown: join(dir, "dsh-tools-restart-port-down.log"),
  };

  const cmdArgs = opts.args.map(quoteArgForCmd).join(" ");
  const envLines = [];
  for (const [name, value] of Object.entries(opts.env ?? {})) {
    if (value === undefined || value === null) continue;
    // ${env:NAME} form — required: env names like `ProgramFiles(x86)` contain
    // parentheses, and `$env:ProgramFiles(x86)` parses as `$env:ProgramFiles`
    // plus a stray `(x86)` token (syntax error).
    envLines.push("${env:" + name + "} = '" + psQuote(value) + "'");
  }

  const ps1Lines = [
    "$ErrorActionPreference = 'Stop'",
    `Start-Sleep -Milliseconds ${WAIT_MS}`,
    `Set-Content -Path '${psQuote(files.ran)}' -Value 'launcher-ran'`,
    ...envLines,
    // NOTE: try/catch must stay in ONE line — a `;` between `}` and `catch`
    // is a PowerShell parse error ("Try statement is missing its Catch or
    // Finally block").
    `try { Start-Process -FilePath '${psQuote(opts.node)}' -ArgumentList '${psQuote(cmdArgs)}' -WorkingDirectory '${psQuote(opts.cwd)}' } catch { try { $_.Exception.Message | Out-File -FilePath '${psQuote(files.error)}' -Encoding utf8 } catch {}; try { Set-Content -Path '${psQuote(files.failed)}' -Value 'start-process-threw' } catch {}; exit 1 }`,
    `Set-Content -Path '${psQuote(files.ok)}' -Value 'start-process-returned'`,
    `Start-Sleep -Milliseconds ${CHECK_MS}`,
    `try { if (Get-NetTCPConnection -LocalPort ${opts.port} -State Listen -ErrorAction SilentlyContinue) { Set-Content -Path '${psQuote(files.portUp)}' -Value 'port-listening' } else { Set-Content -Path '${psQuote(files.portDown)}' -Value 'port-not-listening' } } catch {}`,
  ];

  const cmdContent = [
    "@echo off",
    `powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${files.ps1}"`,
    "exit /b",
  ].join("\r\n") + "\r\n";

  return { files, ps1Content: ps1Lines.join("\n") + "\n", cmdContent };
}

export const methods = {
  restart(req, res, api, payload) {
    if (restarting) {
      api.writeError(res, "restart-in-progress", "restart already in progress", 409);
      return;
    }
    if (process.platform !== "win32") {
      api.writeError(res, "unsupported", "auto restart only supports Windows; restart dsh web manually", 500);
      return;
    }
    restarting = true;

    const node = process.execPath;
    const args = process.argv.slice(1);
    const cwd = process.cwd();
    if (args.length === 0) {
      restarting = false;
      api.writeError(res, "bad-argv", "cannot rebuild the dsh web command line (empty argv)", 500);
      return;
    }
    const port = Number(payload && payload.port);
    const checkPort = Number.isInteger(port) && port > 0 && port < 65536 ? port : 3080;
    const dshHome = process.env.DSH_HOME || join(homedir(), ".dsh");
    const dataDir = join(dshHome, "profiles", "web", "plugins-data");
    try {
      mkdirSync(dataDir, { recursive: true });
    } catch (error) {
      restarting = false;
      api.writeError(res, "data-dir-failed", error instanceof Error ? error.message : String(error), 500);
      return;
    }

    const { files, ps1Content, cmdContent } = buildLauncherFiles({
      node,
      args,
      cwd,
      port: checkPort,
      env: process.env,
      dir: dataDir,
    });

    // Forensics: record the exact captured command for post-mortem analysis.
    try {
      writeFileSync(files.capture, JSON.stringify({ at: new Date().toISOString(), node, args, cwd, port: checkPort }, null, 2) + "\n");
    } catch (error) {
      api.log("capture write failed:", error);
    }
    // Clear stale markers from previous attempts.
    for (const key of ["ran", "ok", "failed", "portUp", "portDown"]) {
      try {
        rmSync(files[key], { force: true });
      } catch {}
    }
    try {
      writeFileSync(files.ps1, ps1Content);
      writeFileSync(files.cmd, cmdContent);
    } catch (error) {
      restarting = false;
      api.writeError(res, "launcher-write-failed", error instanceof Error ? error.message : String(error), 500);
      return;
    }

    api.log("restart requested; node:", node, "args:", JSON.stringify(args), "cwd:", cwd, "port:", checkPort);

    // Dispatch through explorer.exe (the user's shell): the launcher chain is
    // then NOT a descendant of this server, so it survives this process's
    // death and any kill-on-close job covering the server tree.
    const child = spawn("explorer.exe", [files.cmd], { stdio: "ignore", windowsHide: true });
    child.on("error", (error) => {
      restarting = false;
      api.log("explorer dispatch failed:", error);
      try {
        writeFileSync(files.error, "explorer dispatch failed: " + String((error && error.message) || error));
      } catch {}
    });
    child.unref();

    api.writeOk(res, { ok: true, message: "restarting" });
    setTimeout(() => process.exit(0), EXIT_MS);
  },
};
