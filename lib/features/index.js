/**
 * dsh-tools — 功能模块表。
 *
 * 新增一个“工具想法”：
 *   1. 在 lib/features/ 下新建 <key>.js（参照 README.md 的模板）;
 *   2. 在下方 import 一行、FEATURES 数组加一行。
 * 设置页会自动列出新功能并提供开关；宿主按开关决定是否 register。
 *
 * 三个合并功能（delete-chat / plugin-toggle / update-plugin）已迁移完成：
 * 旧插件激活已摘除，合并功能默认开启。
 */

import * as notifyTaskDone from "./notify-task-done.js";
import * as restartWeb from "./restart-web.js";
import * as deleteChat from "./delete-chat.js";
import * as pluginToggle from "./plugin-toggle.js";
import * as updatePlugin from "./update-plugin.js";
import * as pluginCatalog from "./plugin-catalog.js";
import * as harnessCheck from "./harness-check.js";
import * as uiEnhance from "./ui-enhance.js";
import * as uiUsage from "./ui-usage.js";

export const FEATURES = [
  notifyTaskDone,
  restartWeb,
  deleteChat,
  pluginToggle,
  updatePlugin,
  pluginCatalog,
  harnessCheck,
  uiEnhance,
  uiUsage,
];
