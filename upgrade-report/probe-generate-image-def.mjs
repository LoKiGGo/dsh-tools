/**
 * Verify the corrected generate_image tool definition against the REAL host
 * tool-registration contract (0.2.0-rc.2), directly and without a fake harness.
 *
 * We import the host's dsh-tools module and drive its exported primitives the
 * same way tools.register() does internally, then also exercise a faithful
 * stand-in registry that enforces the same guard.
 */
import {
  defineTool,
  validateArgs,
  assertSupportedJsonSchema,
} from "file:///E:/npm-global/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-tools/lib/index.js";

/** The corrected definition — mirrors the vendor/weixin/gateway.js reference. */
const definition = defineTool({
  name: "generate_image",
  description: "根据文字描述生成一张图片，返回图片的本地路径。生成的图片可以直接用 [image:路径] 标记发送给用户。",
  parameters: {
    prompt: { type: "string", required: true, description: "图片内容描述（中文）" },
  },
  output: {
    schema: { type: "string" },
    render: (_args, value) => [{ type: "text", text: `图片已生成: ${value}` }],
  },
  async execute(args) {
    return `C:/tmp/${args.prompt}.png`;
  },
});

let failures = 0;
const ok = (label, cond, extra = "") => {
  console.log(`  ${cond ? "ok  " : "FAIL"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
};

console.log("=== corrected definition shape ===");
console.log(JSON.stringify({ ...definition, execute: "[fn]" }, null, 2));

console.log("\n=== host contract assertions ===");
ok("definition.output present", definition.output !== undefined);
ok("output.render is a function", typeof definition.output?.render === "function");
ok("output.schema present", definition.output?.schema !== undefined);

let schemaErr = null;
try { assertSupportedJsonSchema(definition.output.schema); } catch (e) { schemaErr = e.message; }
ok("output.schema passes assertSupportedJsonSchema", schemaErr === null, schemaErr ?? "");

// validateArgs RETURNS a violations array ([] === valid); it does not throw.
const paramsSpec = { prompt: { type: "string", required: true, description: "图片内容描述（中文）" } };

const validViolations = validateArgs(paramsSpec, { prompt: "一只猫" });
ok("compact spec accepts valid args", Array.isArray(validViolations) && validViolations.length === 0, JSON.stringify(validViolations));

const missingViolations = validateArgs(paramsSpec, {});
ok("compact spec rejects missing required 'prompt'", missingViolations.length > 0, JSON.stringify(missingViolations));

const wrongTypeViolations = validateArgs(paramsSpec, { prompt: 123 });
ok("compact spec rejects wrong arg type", wrongTypeViolations.length > 0, JSON.stringify(wrongTypeViolations));

const rendered = definition.output.render({ prompt: "一只猫" }, "C:/tmp/a.png");
ok("render returns text blocks", Array.isArray(rendered) && rendered[0]?.text?.includes("图片已生成"), JSON.stringify(rendered));

console.log("\n=== stand-in registry mirroring the host register() guard ===");
const registry = {
  register(def) {
    const output = def.output;
    if (output === undefined || typeof output !== "object" || typeof output.render !== "function"
      || (output.presentationMeta !== undefined && typeof output.presentationMeta !== "function")) {
      throw new TypeError(`tool "${def.name}" must declare output { schema, render, presentationMeta? }`);
    }
    assertSupportedJsonSchema(output.schema);
    return () => {};
  },
};

let regErr = null;
let disposer = null;
try { disposer = registry.register(definition); } catch (e) { regErr = e.message; }
ok("corrected definition registers cleanly", regErr === null, regErr ?? "");
ok("register returns a disposer", typeof disposer === "function");

// Negative control: the OLD (broken) shape must still fail the same guard,
// proving this test would have caught the bug.
let oldErr = null;
try {
  registry.register({
    name: "generate_image",
    description: "old",
    parameters: { type: "object", properties: { prompt: { type: "string" } }, required: ["prompt"] },
    execute: async () => "x",
  });
} catch (e) { oldErr = e.message; }
ok("OLD shape still rejected by the same guard", oldErr !== null, oldErr ?? "");

// And the old shape's parameters fail host validateArgs too (the masked 2nd bug).
let oldArgsErr = null;
try {
  validateArgs({ type: "object", properties: { prompt: { type: "string" } }, required: ["prompt"] }, { prompt: "x" });
} catch (e) { oldArgsErr = e.message; }
ok("OLD parameters shape fails host validateArgs (masked 2nd bug)", oldArgsErr !== null, oldArgsErr ?? "");

console.log(`\n${failures === 0 ? "TOOL-DEF OK: all assertions passed" : `TOOL-DEF FAILURES: ${failures}`}`);
process.exit(failures === 0 ? 0 : 1);
