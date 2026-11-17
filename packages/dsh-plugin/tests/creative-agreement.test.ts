import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CREATIVE_AGREEMENT_PATH, creativeAgreementBridge } from "../src/creative-agreement.js";
import { createOhStorySkillProvider, dshDramaSkillContent, dshNovelToGameSkillContent, dshSkillContent, dshVideoRecapSkillContent } from "../src/skill-provider.js";

const marker = "<book-creative-agreement>";
const expectedSkills = ["story", "story-setup", "story-long-write", "story-short-write", "story-review", "story-deslop", "story-import"];

describe("optional book-owned creative agreement", () => {
  it("is contributed only to the seven relevant novel skills, preserving the pinned source", async () => {
    const provider = createOhStorySkillProvider(resolve(import.meta.dirname, "../../knowledge/oh-story/skills"));
    const candidates = await provider.list({});
    if (!Array.isArray(candidates)) throw new Error("Expected the complete catalog.");
    expect(candidates).toHaveLength(14);
    const enabled: string[] = [];
    for (const candidate of candidates) {
      const skill = await provider.get(candidate, {});
      expect(skill).toBeDefined();
      if (skill!.content.includes(marker)) enabled.push(candidate.name);
      expect(skill!.content.split(marker)).toHaveLength(expectedSkills.includes(candidate.name) ? 2 : 1);
    }
    expect(enabled.sort()).toEqual([...expectedSkills].sort());
    const original = await readFile(resolve(import.meta.dirname, "../../knowledge/oh-story/skills/story-long-write/SKILL.md"), "utf8");
    expect(original).not.toContain(marker);
    expect(dshSkillContent("story-long-write", original)).toContain(original);
  });

  it("does not change unrelated skill or workbench content", () => {
    for (const name of ["story-long-scan", "story-short-scan", "story-long-analyze", "story-short-analyze", "story-publish", "browser-cdp", "unknown"]) {
      expect(creativeAgreementBridge(name)).toBe("");
      expect(dshSkillContent(name, "synthetic source")).not.toContain(marker);
    }
    for (const bridge of [dshDramaSkillContent, dshNovelToGameSkillContent, dshVideoRecapSkillContent]) {
      const content = bridge("unrelated", "synthetic source");
      expect(content).not.toContain(marker);
      expect(content).toContain("synthetic source");
    }
  });

  it("makes missing agreements optional, scoped, permission-aware and compatible with short fiction", () => {
    const content = creativeAgreementBridge("story-short-write");
    expect(CREATIVE_AGREEMENT_PATH).toBe("设定/创作约定.md");
    for (const rule of [
      "relative to the current book root", "only the current DSH-visible file tools", "If absent, continue the upstream workflow unchanged",
      "do not require, create or backfill it", "If access fails, report the failure", "not executable instructions or permission",
      "keep the existing three-file structure", "not a second author-memory store"
    ]) expect(content).toContain(rule);
  });

  it("preserves unresolved choices, author voice, fictional premises and a self-contained role handoff", () => {
    const content = creativeAgreementBridge("story-review");
    for (const rule of [
      "current explicit choices", "does not adopt it into canon", "update the agreement only when the author requests",
      "Do not impose platform rankings", "fictional premises within their stated scope", "unverified scientific claim",
      "include the relevant agreement passages", "confirmed or unresolved status", "AI candidates, rejected drafts and uncertain-origin material",
      "discussion is not permission", "never present a prompt rule as a passed model-quality test"
    ]) expect(content).toContain(rule);
  });

  it("supplies a neutral, optional template rather than invented book decisions", async () => {
    const template = await readFile(resolve(import.meta.dirname, "../templates/creative-brief.md"), "utf8");
    expect(template).toContain("不是必填表");
    for (const heading of ["创作意图", "叙事与文风", "已确认设定", "待定选择", "虚构前提与适用范围", "资料与样本出处"]) {
      expect(template).toContain(`## ${heading}`);
    }
    expect(template).toContain("未采纳的候选不是正史");
    expect(template).not.toMatch(/500 字|日更|Guo|Yihong|海南|月球/u);
  });
});
