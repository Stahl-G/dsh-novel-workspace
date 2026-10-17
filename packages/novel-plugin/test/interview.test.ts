import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connectNovel, createProject, editNovel, initWorkspace, novelView } from "@kaitu/core";
import { describe, expect, it } from "vitest";
import { hash } from "../../core/src/novel/store.js";

describe("构思访谈", () => {
  it("记下确认与开放，生成提纲，不改正文", async () => {
    const dir = fs.mkdtempSync(join(tmpdir(), "kaitu-story-"));
    const source = join(dir, "正文");
    fs.mkdirSync(source);
    const chapter = join(source, "第一章.md");
    fs.writeFileSync(chapter, "---\norigin: 作者\n---\n# 观测\n我在实验室看见他离开。我没有叫住他。我站在原地。\n");
    fs.writeFileSync(
      join(source, "候选.md"),
      "---\nrole: candidate\norigin: AI\n---\n# 候选\n由 AI 生成的另一版结局。\n",
    );
    const before = hash(fs.readFileSync(chapter));
    const ws = await initWorkspace(join(dir, "workspace"), { timeZone: "UTC" });
    const { slug: project } = await createProject(ws, {
      title: "访谈",
      kind: "personal",
      local_only: true,
      links: [{ path: source, role: "manuscript" }],
    });
    connectNovel(ws, { project, sourceRoot: source, mode: "files", exclude: [], preview: false });
    const edit = (command: object) => {
      const view = novelView(ws, project);
      return editNovel(ws, project, view.revision, command);
    };
    edit({ type: "story", op: "spark", text: "一个在月球上长大的少女，维持不了一段亲密关系。" });
    let story = novelView(ws, project).data.story;
    expect(story?.confirmed).toEqual([]);
    expect(story?.question?.prompt).toContain("哪一种矛盾");
    expect(story?.portrait.authorDocuments).toBe(1);
    expect(story?.portrait.aiMarked).toBeGreaterThan(0);
    expect(story?.portrait.notes.find((note) => note.id === "voice")?.text).toContain("第一人称");
    edit({ type: "story", op: "answer", choice: "stay-open" });
    story = novelView(ws, project).data.story;
    expect(story?.open).toEqual(["先别收成一种矛盾"]);
    expect(story?.confirmed).toEqual([]);
    edit({ type: "story", op: "answer", choice: "leaver", custom: "先写她想离开、对方想留住承诺" });
    edit({ type: "story", op: "answer", choice: "unset" });
    edit({ type: "story", op: "answer", choice: "accident" });
    story = novelView(ws, project).data.story;
    expect(story?.step).toBe("outline");
    expect(story?.beats).toHaveLength(8);
    expect(story?.beats.every((beat) => beat.canon === "tentative")).toBe(true);
    expect(story?.confirmed.some((item) => item.includes("她想离开"))).toBe(true);
    expect(story?.question).toBeNull();
    edit({ type: "story", op: "correct", id: "dilemma", text: "先不要决定谁离开", canon: "open" });
    edit({ type: "story", op: "outline" });
    story = novelView(ws, project).data.story;
    expect(story?.open).toContain("先不要决定谁离开");
    expect(story?.beats[3]?.text).toContain("还没决定故事站在谁那边");
    edit({ type: "story", op: "beat", chapter: 8, canon: "confirmed" });
    expect(novelView(ws, project).data.story?.beats[7]?.canon).toBe("confirmed");
    expect(hash(fs.readFileSync(chapter))).toBe(before);
    expect(fs.readdirSync(source).sort()).toEqual(["候选.md", "第一章.md"]);
  });
});
