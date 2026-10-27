import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Context } from "@deepseek-ai/cordis";
import { Workspace, novelFile } from "@kaitu/core";
import { expect, it, vi } from "vitest";
import { apply as applyScience } from "../../sf-plugin/src/index.js";
import { openKaituSession } from "../src/client/agent-prompt.js";
import { apply } from "../src/index.js";

it("小说服务读取缺省分类的 schema 1 资料，取消工具与未知版本均不改写文件", async () => {
  const root = mkdtempSync(join(tmpdir(), "novel-host-compat-"));
  try {
    const source = join(root, "旧作品");
    mkdirSync(source);
    const manuscript = join(source, "第一章.md");
    const original = "# 第一章\r\n合成原稿。\r\n";
    writeFileSync(manuscript, original);
    const workspace = join(root, "workspace");
    type Tool = { name: string; execute(args: unknown, exec: { signal: AbortSignal }): Promise<unknown> };
    const tools = new Map<string, Tool>();
    const ctx = new Context();
    ctx.provide("tools", {
      register: (tool: Tool) => {
        tools.set(tool.name, tool);
        return () => tools.delete(tool.name);
      },
    });
    ctx.provide("systemPrompt", { section: () => () => {} });
    ctx.provide("typert", { register: () => () => {} });
    apply(ctx, { workspace });
    const request = async (operation: string, input: object = {}) =>
      JSON.parse(await ctx.kaituNovel.request(operation, JSON.stringify(input)));
    const { project } = await request("addProject", { path: source, mode: "link" });
    const file = novelFile(new Workspace(workspace), project);
    const legacy = JSON.parse(readFileSync(file, "utf8"));
    for (const document of legacy.documents) document.classification = undefined;
    const bytes = `${JSON.stringify(legacy, null, 2)}\n`;
    writeFileSync(file, bytes);
    const view = await request("view", { project });
    expect(view.data.documents[0].classification.role).toBe("manuscript");
    expect(readFileSync(file, "utf8")).toBe(bytes);
    const aborted = new AbortController();
    aborted.abort();
    const manage = tools.get("kaitu_novel_manage");
    if (!manage) throw new Error("manage tool missing");
    await expect(
      manage.execute({ project, command: { type: "pin", value: false } }, { signal: aborted.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect((await request("view", { project })).data.pinned).toBe(true);
    expect(readFileSync(file, "utf8")).toBe(bytes);
    expect(readFileSync(manuscript, "utf8")).toBe(original);
    const unsupported = JSON.stringify({ ...legacy, schemaVersion: 99 });
    writeFileSync(file, unsupported);
    await expect(request("view", { project })).rejects.toThrow(/版本暂不支持/);
    const revision = createHash("sha256").update(unsupported).digest("hex");
    const modified = statSync(file).mtimeMs;
    for (const [operation, args] of [
      ["edit", { command: { type: "pin", value: false } }],
      ["propose", { fact: {} }],
      ["draft", { input: { title: "合成候选", text: "合成内容", scene: "unknown" } }],
      ["applyDraft", { id: "unknown", operation: "append" }],
      ["saveScene", { input: { scene: "unknown", fileHash: "unknown", text: "合成内容" } }],
      ["undoScene", {}],
    ] as const)
      await expect(request(operation, { project, revision, ...args })).rejects.toThrow(/版本暂不支持/);
    expect(readFileSync(file, "utf8")).toBe(unsupported);
    expect(statSync(file).mtimeMs).toBe(modified);
    expect(readFileSync(manuscript, "utf8")).toBe(original);
    writeFileSync(file, bytes);
    applyScience(ctx);
    const scienceFile = join(legacy.managedRoot, "science.json");
    const unsupportedScience = JSON.stringify({ schemaVersion: 99, rules: [], findings: [] });
    writeFileSync(scienceFile, unsupportedScience);
    const scienceRevision = createHash("sha256").update(unsupportedScience).digest("hex");
    const scienceModified = statSync(scienceFile).mtimeMs;
    for (const [operation, args] of [
      ["view", {}],
      ["rule", { rule: {} }],
      ["check", { input: {} }],
      ["review", { input: { id: "unknown", status: "deferred", note: "合成备注" } }],
      ["note", { input: { scene: legacy.scenes[0].id, type: "plausibility_note", conclusion: "合成结论" } }],
      ["import", { documentId: legacy.documents[0].id }],
    ] as const)
      expect(() =>
        ctx.kaituScience.request(operation, { project, revision: scienceRevision, ...args }),
      ).toThrow(/版本暂不支持/);
    expect(readFileSync(scienceFile, "utf8")).toBe(unsupportedScience);
    expect(statSync(scienceFile).mtimeMs).toBe(scienceModified);
    expect(readFileSync(file, "utf8")).toBe(bytes);
    expect(readFileSync(manuscript, "utf8")).toBe(original);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("等待工作区期间离开页面不会打开迟到会话", async () => {
  const navigation = new AbortController();
  const pendingWorkspace = Promise.withResolvers<{ workspaceId: string }>();
  const createSession = vi.fn(async () => "late-session");
  const openSession = vi.fn();
  const setDraft = vi.fn();
  const pending = openKaituSession(
    {
      layout: { beginNavigation: () => navigation.signal },
      workspaces: { create: () => pendingWorkspace.promise },
      sessions: { create: createSession, scope: () => new Context() },
      uiWorkspace: { openSession },
      conversation: { input: { for: () => ({ setDraft }) } },
    },
    "/synthetic/workspace",
    "取消的提示词",
  );
  navigation.abort();
  pendingWorkspace.resolve({ workspaceId: "late-workspace" });
  expect(await pending).toBe(false);
  expect(createSession).not.toHaveBeenCalled();
  expect(openSession).not.toHaveBeenCalled();
  expect(setDraft).not.toHaveBeenCalled();
});
