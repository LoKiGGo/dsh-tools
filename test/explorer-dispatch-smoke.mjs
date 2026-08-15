/**
 * dsh-tools — explorer dispatch smoke test (parent stays alive).
 *
 * Validates the production dispatch transport: a .cmd that runs a hidden
 * powershell writing a marker, dispatched through explorer.exe (the user's
 * shell) — the same transport restart-web uses to escape the server's
 * process tree. The launcher.ps1 content itself is covered by
 * restart-launcher-smoke.mjs.
 *
 * Run:  node test/explorer-dispatch-smoke.mjs
 */

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "dsh-tools-explorer-dispatch-"));
const marker = join(tmp, "marker.txt");
const cmdPath = join(tmp, "launcher.cmd");

let failures = 0;
function assert(cond, msg) {
	if (!cond) {
		failures += 1;
		console.error("FAIL:", msg);
	} else {
		console.log("ok:", msg);
	}
}

const esc = (s) => String(s).replace(/'/g, "''");
const cmdContent = [
	"@echo off",
	`powershell -NoProfile -NonInteractive -Command "Set-Content -Path '${esc(marker)}' -Value 'explorer-chain-ok'"`,
	"exit /b",
].join("\r\n") + "\r\n";
writeFileSync(cmdPath, cmdContent);

const child = spawn("explorer.exe", [cmdPath], { stdio: "ignore", windowsHide: true });
let spawnFailed = null;
child.on("error", (e) => {
	spawnFailed = e.message;
});
child.unref();
assert(spawnFailed === null, "explorer.exe spawns without error");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = false;
for (let i = 0; i < 30; i += 1) {
	await sleep(500);
	if (existsSync(marker)) {
		ok = true;
		break;
	}
}
assert(ok, "explorer-dispatched cmd chain ran the hidden powershell");
if (ok) {
	assert(readFileSync(marker, "utf8").trim() === "explorer-chain-ok", "dispatched payload written intact");
}

rmSync(tmp, { recursive: true, force: true });

if (failures > 0) {
	console.error(`\nEXPLORER DISPATCH SMOKE FAILED: ${failures} assertion(s)`);
	process.exit(1);
}
console.log("\nEXPLORER DISPATCH SMOKE OK: all assertions passed");
