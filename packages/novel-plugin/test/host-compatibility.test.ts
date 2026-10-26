import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Context } from "@deepseek-ai/cordis";
import { Workspace, novelFile } from "@kaitu/core";
import { expect, it } from "vitest";
import { type KaituSessionServices, openKaituSession } from "../src/client/agent-prompt.js";
import { apply } from "../src/index.js";

it("rc.3 服务重开 schema 1 旧资料，保存/撤销保留原文，拒绝未知资料版本", async () => {
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
    // Versions 0.3.1/0.3.2 and 0.1.2 all use schema 1. Older sidecars
    // may omit optional editor/draft fields; reading must not rewrite them.
    const legacy = JSON.parse(readFileSync(file, "utf8"));
    legacy.writingMode = undefined;
    legacy.drafts = undefined;
    legacy.editorUndo = undefined;
    const bytes = `${JSON.stringify(legacy, null, 2)}\n`;
    writeFileSync(file, bytes);
    const view = await request("view", { project });
    expect(readFileSync(file, "utf8")).toBe(bytes);
    const scene = await request("scene", { project, scene: view.data.scenes[0].id });
    expect(scene.text).toContain("合成原稿");
    expect(await request("workspace")).toEqual({ path: workspace });
    await request("edit", { project, revision: view.revision, command: { type: "mode", mode: "writing" } });
    let current = await request("view", { project });
    await request("saveScene", {
      project,
      revision: current.revision,
      input: { scene: scene.scene.id, fileHash: scene.anchor.fileHash, text: `${scene.text}合成新增。` },
    });
    expect(readFileSync(manuscript, "utf8")).toContain("合成新增");
    current = await request("view", { project });
    await request("undoScene", { project, revision: current.revision });
    expect(readFileSync(manuscript, "utf8")).toBe(original);
    expect(tools.size).toBe(7);
    const aborted = new AbortController();
    aborted.abort();
    const manage = tools.get("kaitu_novel_manage");
    if (!manage) throw new Error("manage tool missing");
    await expect(
      manage.execute({ project, command: { type: "pin", value: false } }, { signal: aborted.signal }),
    ).rejects.toThrow();
    const unsupported = JSON.stringify({ ...legacy, schemaVersion: 99 });
    writeFileSync(file, unsupported);
    await expect(request("view", { project })).rejects.toThrow(/版本暂不支持/);
    expect(readFileSync(file, "utf8")).toBe(unsupported);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("rc.3 会话使用作品工作区并保留提示词为草稿，取消导航不打开会话", async () => {
  const navigation = new AbortController();
  const scope = new Context();
  const events: unknown[] = [];
  const services: KaituSessionServices = {
    layout: { beginNavigation: () => navigation.signal },
    workspaces: {
      create: async (input) => {
        events.push(input);
        return { workspaceId: "synthetic-workspace" };
      },
    },
    sessions: {
      create: async (input) => {
        events.push(input);
        return "synthetic-session";
      },
      scope: () => scope,
    },
    uiWorkspace: { openSession: (id) => events.push(id) },
    conversation: {
      input: {
        for: (value) => {
          expect(value).toBe(scope);
          return { setDraft: (text) => events.push(text) };
        },
      },
    },
  };
  expect(await openKaituSession(services, "/synthetic/workspace", "合成写作上下文")).toBe(true);
  expect(events).toEqual([
    { path: "/synthetic/workspace" },
    { workspaceId: "synthetic-workspace" },
    "synthetic-session",
    "合成写作上下文",
  ]);
  events.length = 0;
  navigation.abort();
  expect(await openKaituSession(services, "/synthetic/workspace", "取消的提示词")).toBe(false);
  expect(events).toEqual([{ path: "/synthetic/workspace" }]);
});
