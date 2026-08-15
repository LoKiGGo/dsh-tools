/**
 * dsh-tools — restart launcher mechanics test (harmless payload, no real
 * server involved).
 *
 * Imports the REAL `buildLauncherFiles` generator from restart-web.js with a
 * throwaway node command (marker-writer) instead of the dsh argv, writes the
 * generated launcher.ps1 / launcher.cmd into a temp dir, and runs the ps1
 * exactly as the production .cmd would (`powershell -File`). Asserts the full
 * in-launcher sequence: delay honoured, markers written, target process
 * started with the mixed-quote payload intact, port probe recorded.
 *
 * Run:  node test/restart-launcher-smoke.mjs
 */

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildLauncherFiles } from "../lib/features/restart-web.js";

const tmp = mkdtempSync(join(tmpdir(), "dsh-tools-launcher-"));
const marker = join(tmp, "marker.txt");
const markerTwo = join(tmp, "marker2.txt");

let failures = 0;
function assert(cond, msg) {
	if (!cond) {
		failures += 1;
		console.error("FAIL:", msg);
	} else {
		console.log("ok:", msg);
	}
}

/** Generate the production launcher text with a harmless payload. */
function buildFor(args) {
	return buildLauncherFiles({
		node: process.execPath,
		args,
		cwd: tmp,
		port: 59999, // nothing listens here → port-down marker expected
		env: {
			DSH_TEST_MARKER: marker,
			// parens in the name — the ${env:...} quoting must survive
			"ProgramFiles(x86)": "C:\\Fake (x86) Path",
		},
		dir: tmp,
	});
}

function writeFs(built) {
	writeFileSync(built.files.ps1, built.ps1Content);
	writeFileSync(built.files.cmd, built.cmdContent);
}

function runPs1(built) {
	return new Promise((resolve) => {
		const child = spawn(
			"powershell.exe",
			["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", built.files.ps1],
			{ stdio: "ignore", windowsHide: true },
		);
		child.on("error", (error) => resolve({ code: null, error: String(error.message) }));
		child.on("exit", (code) => resolve({ code }));
	});
}

// --- generation shape ---
const generated = buildFor(["-e", "console.log('x')"]);
assert(generated.ps1Content.includes("Start-Sleep -Milliseconds 2000"), "ps1 carries the launch delay");
assert(generated.ps1Content.includes("try { Start-Process"), "ps1 carries Start-Process");
assert(generated.ps1Content.includes("Get-NetTCPConnection -LocalPort 59999"), "ps1 carries the port probe");
assert(generated.ps1Content.includes("${env:ProgramFiles(x86)} = 'C:\\Fake (x86) Path'"), "paren env names use the ${env:...} form");
assert(generated.cmdContent.includes('powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + generated.files.ps1 + '"'), "cmd entry invokes the ps1");

// --- run 1: single quotes inside the payload (quote-escaping stress) ---
const payload1 = `require('fs').writeFileSync(${JSON.stringify(marker)}, 'launched-ok', 'utf8')`;
const first = buildFor(["-e", payload1]);
writeFs(first);

const startedAt = Date.now();
const result1 = await runPs1(first);
assert(result1.code === 0, `ps1 exits 0 (got ${result1.code})`);
assert(Date.now() - startedAt >= 1800, "launcher honoured the 2s delay before starting the target");
assert(existsSync(first.files.ran), "ran marker written");
assert(existsSync(first.files.ok), "ok marker written");
assert(!existsSync(first.files.failed) && !existsSync(first.files.error), "no failure markers");
assert(existsSync(marker) && readFileSync(marker, "utf8") === "launched-ok", "target process started and wrote the marker");
assert(existsSync(first.files.portDown) && !existsSync(first.files.portUp), "port probe recorded port-not-listening");

// --- run 2: mixed double/single quotes (worst-case payload) ---
const payload2 = `require('fs').writeFileSync(${JSON.stringify(markerTwo)}, "double'quote", 'utf8')`;
const second = buildFor(["-e", payload2]);
writeFs(second);
const result2 = await runPs1(second);
assert(result2.code === 0, `second ps1 exits 0 (got ${result2.code})`);
assert(existsSync(markerTwo) && readFileSync(markerTwo, "utf8") === "double'quote", "mixed-quote payload preserved exactly");

rmSync(tmp, { recursive: true, force: true });

if (failures > 0) {
	console.error(`\nLAUNCHER SMOKE FAILED: ${failures} assertion(s)`);
	process.exit(1);
}
console.log("\nLAUNCHER SMOKE OK: all assertions passed");
