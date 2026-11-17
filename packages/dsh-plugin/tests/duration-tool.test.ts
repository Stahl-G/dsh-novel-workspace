import type { Context } from "@deepseek-ai/cordis";
import type { ToolRunContext } from "@deepseek-ai/dsh-tools";
import { describe, expect, it, vi } from "vitest";
import { createDurationTool, KAITU_DURATION_TOOL_NAME, registerDurationTool } from "../src/duration-tool.js";
import { dshSkillContent } from "../src/skill-provider.js";
import { checkDeclaredDuration } from "../../../scripts/kaitu-duration-check.mjs";

const fixture = () => ({
  ruleConfirmed: true, sceneConfirmed: true,
  confirmationQuote: "确认：每圈恰好8分钟，同一环廊匀速2圈，不停留，没有例外。",
  ruleSource: "设定/世界.md:4", sceneSource: "正文/第001章.md:7",
  ruleQuote: "每圈恰好8分钟", sceneQuote: "匀速2圈后过去了19分钟",
  ruleScope: "环廊匀速不停留", sceneScope: "环廊匀速不停留",
  ruleUnit: "minute", sceneUnit: "minute", minutesPerCycle: 8, cycles: 2,
  elapsedMinutes: 19, constantDuration: true, extraDelayMinutes: 0, exception: "none"
});

describe("native author-side duration check", () => {
  it("registers one native tool without running it or touching a filesystem", () => {
    const register = vi.fn();
    registerDurationTool({ tools: { register } } as unknown as Context);
    expect(register).toHaveBeenCalledOnce();
    expect(register.mock.calls[0]?.[0].name).toBe(KAITU_DURATION_TOOL_NAME);
  });

  it("uses the same pure calculation and returns traceable evidence without changing inputs", async () => {
    const args = fixture();
    const before = structuredClone(args);
    const pure = checkDeclaredDuration({
      rule: { confirmed: true, scope: args.ruleScope, unit: args.ruleUnit, minutesPerCycle: 8, quote: args.ruleQuote },
      scene: { confirmed: true, scope: args.sceneScope, unit: args.sceneUnit, cycles: 2, elapsedMinutes: 19, constantDuration: true, extraDelayMinutes: 0, exception: "none", quote: args.sceneQuote }
    });
    const result = await createDurationTool().execute(args, {} as ToolRunContext);
    expect(result).toMatchObject({ status: pure.status, message: expect.stringContaining("8 × 2 = 16 分钟") });
    expect(result).toMatchObject({ message: expect.stringContaining(args.confirmationQuote) });
    expect(result).toMatchObject({ message: expect.stringContaining(args.ruleSource) });
    expect(result).toMatchObject({ message: expect.stringContaining(args.sceneSource) });
    expect(result).toMatchObject({ message: expect.stringContaining("未改稿") });
    expect(args).toEqual(before);
  });

  it("abstains on missing confirmation/evidence or unspecified conditions and respects fictional exceptions", async () => {
    const tool = createDurationTool();
    for (const patch of [
      { confirmationQuote: "" }, { ruleSource: "" }, { sceneSource: "" },
      { ruleConfirmed: false }, { sceneConfirmed: false }, { ruleQuote: "" },
      { sceneQuote: "" }, { ruleUnit: "unknown" }, { sceneScope: "elsewhere" },
      { extraDelayMinutes: undefined }, { constantDuration: false },
      { exception: "fictional time distortion" }, { minutesPerCycle: 8.5 }
    ]) {
      const args = Object.fromEntries(Object.entries({ ...fixture(), ...patch }).filter(([, value]) => value !== undefined));
      const result = await tool.execute(args, {} as ToolRunContext);
      expect(result).toMatchObject({ status: "not-checked", message: expect.stringContaining("未检查") });
    }
    expect(await tool.execute({}, {} as ToolRunContext)).toMatchObject({ status: "not-checked" });
  });

  it("accepts an internally consistent arithmetic case without declaring scientific validity", async () => {
    expect(await createDurationTool().execute({ ...fixture(), elapsedMinutes: 16 }, {} as ToolRunContext))
      .toMatchObject({ status: "consistent", message: expect.stringContaining("不是现实科学事实") });
  });

  it("offers the optional native tool only from review; never asks authors to run scripts", () => {
    const review = dshSkillContent("story-review", "review source");
    expect(review).toContain(KAITU_DURATION_TOOL_NAME);
    expect(review).toContain("never ask the author to run a script");
    expect(review).toContain("not a clean bill of health");
    for (const skill of ["story-long-write", "story-import", "story-deslop", "story-long-scan"]) {
      expect(dshSkillContent(skill, "unchanged source")).not.toContain(KAITU_DURATION_TOOL_NAME);
    }
  });
});
