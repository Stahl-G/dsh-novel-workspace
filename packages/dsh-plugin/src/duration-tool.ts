import type { Context } from "@deepseek-ai/cordis";
import { defineTool, type ToolDefinition } from "@deepseek-ai/dsh-tools";
import { checkDeclaredDuration } from "../../../scripts/kaitu-duration-check.mjs";

export const KAITU_DURATION_TOOL_NAME = "kaitu_check_declared_duration";

/** Native read-only arithmetic, not an inference engine or manuscript editor. */
export function createDurationTool(): ToolDefinition {
  return defineTool({
    name: KAITU_DURATION_TOOL_NAME,
    description: "Read-only check of one author-confirmed fictional-world arithmetic relation: whole cycles × constant whole minutes per cycle. No I/O, prose extraction, unit conversion, scientific truth claim or edits. Supply exact read passages and explicit author confirmation, not inferred assumptions. Missing or unsupported conditions return not-checked. Suggestions never count as acceptance.",
    parameters: {
      ruleConfirmed: { type: "boolean", description: "True only if the author explicitly confirmed this rule and its scope, not merely because the Agent inferred it." },
      sceneConfirmed: { type: "boolean", description: "True only if the author explicitly confirmed the extracted scene conditions." },
      confirmationQuote: { type: "string", description: "Exact author confirmation of rule and extracted conditions. An Agent assertion is not confirmation." },
      ruleSource: { type: "string", description: "Book-relative file and passage locator actually read, or author message locator." },
      sceneSource: { type: "string", description: "Book-relative file and passage locator actually read, or author message locator." },
      ruleQuote: { type: "string", description: "Exact rule passage read, not a paraphrase." },
      sceneQuote: { type: "string", description: "Exact scene passage read, not a paraphrase." },
      ruleScope: { type: "string", description: "Explicit scope of this rule." },
      sceneScope: { type: "string", description: "Explicit scene scope; must match the rule." },
      ruleUnit: { type: "string", description: "Only minute is checked; unknown or other units are not converted." },
      sceneUnit: { type: "string", description: "Only minute is checked." },
      minutesPerCycle: { type: "number", description: "Explicit exact whole minutes per cycle; leave unknown values unset." },
      cycles: { type: "number", description: "Explicit exact whole cycles." },
      elapsedMinutes: { type: "number", description: "Explicit exact whole elapsed minutes in the scene." },
      constantDuration: { type: "boolean", description: "True only if constant cycle duration is explicitly confirmed." },
      extraDelayMinutes: { type: "number", description: "Zero only if the author explicitly confirms no extra delay; never default missing data to zero." },
      exception: { type: "string", description: "none only if explicitly confirmed no exception applies. Unknown or fictional exceptions abstain." }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          status: { type: "string", required: true, enum: ["not-checked", "consistent", "conflict"] },
          message: { type: "string", required: true }
        }
      },
      render: (_args, value) => [{ type: "text", text: value.message }]
    },
    isConcurrencySafe: () => true,
    execute(args) {
      if (![args.confirmationQuote, args.ruleSource, args.sceneSource].every((text) => typeof text === "string" && text.trim())) {
        return Promise.resolve({ status: "not-checked", message: "未检查：缺少作者明确确认或可回查的规则、正文出处。不推断缺失条件，不改稿。" });
      }
      const result = checkDeclaredDuration({
        rule: { confirmed: args.ruleConfirmed, quote: args.ruleQuote, scope: args.ruleScope, unit: args.ruleUnit, minutesPerCycle: args.minutesPerCycle },
        scene: { confirmed: args.sceneConfirmed, quote: args.sceneQuote, scope: args.sceneScope, unit: args.sceneUnit, cycles: args.cycles, elapsedMinutes: args.elapsedMinutes, constantDuration: args.constantDuration, extraDelayMinutes: args.extraDelayMinutes, exception: args.exception }
      });
      if (result.status === "not-checked") return Promise.resolve({ status: result.status, message: `未检查：${result.reason} 不改稿。` });
      return Promise.resolve({
        status: result.status,
        message: `${result.status === "conflict" ? "书内算术条件冲突" : "本项书内算术条件一致"}：${result.equation}；正文为 ${String(result.observedMinutes)} 分钟。\n规则（${args.ruleSource}）：${result.evidence.rule}\n正文（${args.sceneSource}）：${result.evidence.scene}\n作者确认：${args.confirmationQuote}\n${result.caveat}\n未改稿。由作者选择修订数值、重新确认条件或保持待定；语法与创意建议不由此工具判定。`
      });
    }
  });
}

export function registerDurationTool(context: Context): void {
  context.tools.register(createDurationTool());
}
