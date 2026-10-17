import { expect, it } from "vitest";
import { classifyNovelDocument } from "../../core/src/novel/classify.js";
it("识别用途、明确来源和格式线索，并保留区别", () => {
  const template = "# 世界规则\n以下是整理的建议，仅供参考。\n" + "## 规则\n**参数**\n***\n".repeat(12);
  expect(classifyNovelDocument("设定集.md", template)).toMatchObject({
    role: "setting",
    origin: "likely_ai",
  });
  expect(classifyNovelDocument("正文.md", "---\norigin: human\n---\n" + template).origin).toBe("author");
  expect(classifyNovelDocument("正文.md", "她停下来。\n***\n天亮了。")).toMatchObject({
    role: "manuscript",
    origin: "unknown",
  });
  expect(classifyNovelDocument("世界书.md", "# 世界规则\n月球城市有三条街。")).toMatchObject({
    role: "setting",
    origin: "unknown",
  });
  expect(classifyNovelDocument("候选稿.md", "---\ngenerated_by: ChatGPT\n---\n# 新章节")).toMatchObject({
    role: "candidate",
    origin: "ai",
  });
});
