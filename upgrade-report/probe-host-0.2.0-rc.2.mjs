/**
 * Read-only probe: verify every deep import the dsh-tools plugin performs
 * against the ACTUAL 0.2.0-rc.2 host installation.
 *
 * Resolution: host tree is E:\npm-global\node_modules\@deepseek-ai\dsh, and its
 * nested node_modules holds the L1 core packages. We import from there by
 * absolute path so the answer reflects what the running host would give, not
 * the workspace's stale 0.1.5-rc.1 copies.
 */
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

const HOST = "E:\\npm-global\\node_modules\\@deepseek-ai\\dsh";
const CORE = join(HOST, "node_modules", "@deepseek-ai");

/** plugin import specifier -> what the plugin uses it for */
const DEEP_IMPORTS = [
  { pkg: "dsh-agent", symbol: "installModelSelection", site: "lib/wechat/vendor/bridge.js:12" },
  { pkg: "dsh-llm", symbol: "createUserMessage", site: "lib/wechat/vendor/bridge.js:14" },
  { pkg: "dsh-session", symbol: "SessionId", site: "lib/wechat/vendor/bridge.js:15" },
  { pkg: "dsh-cmdline", symbol: "parseCmdline", site: "lib/wechat/vendor/weixin/entry.js:12" },
  { pkg: "dsh-tools", symbol: "defineTool", site: "lib/wechat/vendor/weixin/gateway.js:1" },
];

const pkgDir = (name) => join(CORE, name);
const entryOf = (dir) => {
  const pj = join(dir, "package.json");
  if (!existsSync(pj)) return undefined;
  return join(dir, "lib", "index.js");
};

console.log("host tree:", HOST);
console.log("core tree:", CORE);
console.log("");

for (const { pkg, symbol, site } of DEEP_IMPORTS) {
  const dir = pkgDir(pkg);
  if (!existsSync(dir)) {
    console.log(`MISSING-PACKAGE  ${pkg} (needed for ${symbol} at ${site})`);
    continue;
  }
  const pj = JSON.parse((await import("node:fs")).readFileSync(join(dir, "package.json"), "utf8"));
  const entry = entryOf(dir);
  let verdict = "IMPORT-FAILED";
  let detail = "";
  let exportCount = -1;
  try {
    const mod = await import(pathToFileURL(entry).href);
    const keys = Object.keys(mod);
    exportCount = keys.length;
    const has = symbol in mod;
    const value = mod[symbol];
    const kind = typeof value;
    verdict = has ? "OK" : "SYMBOL-MISSING";
    detail = has ? `typeof=${kind}` : `not exported`;
    if (has && kind === "undefined") verdict = "SYMBOL-UNDEFINED";
  } catch (error) {
    detail = error instanceof Error ? `${error.name}: ${error.message.split("\n")[0]}` : String(error);
  }
  console.log(`${verdict.padEnd(17)} ${pkg}@${pj.version}  ${symbol}  [${detail}] exports=${exportCount}  ${site}`);
}

console.log("");
console.log("=== remove-symbol check (symbols that had existed in older lines) ===");
const REMOVED_CHECK = [
  { pkg: "dsh-llm", symbols: ["offloadRequestImagesWithPolicy", "offloadedImagePrefixCount"] },
];
for (const { pkg, symbols } of REMOVED_CHECK) {
  const entry = entryOf(pkgDir(pkg));
  const mod = await import(pathToFileURL(entry).href);
  for (const s of symbols) console.log(`  ${pkg}.${s}: ${s in mod ? "present" : "ABSENT (removed)"}`);
}
