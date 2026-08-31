/**
 * dsh-tools — client bundle builder.
 *
 * Composes lib/client/*.js source fragments into the single DSH classic
 * client bundle lib/client.js.
 *
 * The fragments are plain JavaScript statements that live inside the
 * `window.__ModuleLoader__.load({ id: "dsh-tools", factory })` closure.
 * This script intentionally keeps the exact wrapper used by the DSH client
 * module system and preserves CRLF line endings so the generated bundle is
 * stable and byte-compatible with the previous hand-maintained file.
 *
 * Run: node scripts/build-client.mjs
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const clientDir = join(root, "lib", "client");
const outFile = join(root, "lib", "client.js");

const EOL = "\r\n";

const FRAGMENTS = [
  "core.js",
  "delete-chat.js",
  "plugin-toggle.js",
  "update-plugin.js",
  "plugin-catalog.js",
  "wechat.js",
  "settings.js",
  "notify.js",
  "usage.js",
  "apply.js",
];

function normalizeEOL(text) {
  return text.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
}

function readFragment(name) {
  const text = normalizeEOL(readFileSync(join(clientDir, name), "utf8"));
  if (!text.endsWith(EOL)) {
    throw new Error(`fragment ${name} must end with ${JSON.stringify(EOL)}`);
  }
  return text;
}

function build() {
  const header = readFragment("00-header.js");

  const head = [
    "window.__ModuleLoader__.load({",
    '\tid: "dsh-tools",',
    "\tfactory: (require) => {",
    "\t\tvar module = { exports: {} };",
    "\t\tvar exports = module.exports;",
    '\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });',
  ].join(EOL) + EOL;

  const tail = [
    "\t\treturn module.exports;",
    "\t}",
    "});",
  ].join(EOL) + EOL;

  const body = FRAGMENTS.map(readFragment).join("");
  const output = header + head + body + tail;

  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, output, "utf8");

  const bytes = Buffer.byteLength(output, "utf8");
  console.log(`built ${outFile} (${bytes} bytes)`);
}

build();
