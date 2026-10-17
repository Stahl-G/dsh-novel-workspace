import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Workspace,
  editNovel,
  novelProjects,
  novelScene,
  novelView,
  saveNovelScene,
  undoNovelScene,
} from "@kaitu/core";
import { expect, it } from "vitest";
import {
  addLibraryProject,
  browseLibraryFolders,
  libraryProjects,
  removeLibraryProject,
  setLibraryHidden,
} from "../src/library.js";

it("导入副本、隐藏恢复与移除持久生效，原目录关联不复制且移除不删原稿", async () => {
  const root = mkdtempSync(join(tmpdir(), "novel-library-"));
  try {
    const source = join(root, "作品");
    mkdirSync(source);
    writeFileSync(join(source, "正文.md"), "作者正在写的正文");
    writeFileSync(join(source, "人物卡_林安.md"), "# 林安\n十七岁。");
    writeFileSync(join(source, "分场大纲.md"), "# 第一场\n相遇\n# 第二场\n分别");
    const listing = browseLibraryFolders({ path: source });
    expect(listing.path).toBe(realpathSync(source));
    expect(listing.entries).toEqual([]);
    expect(listing.crumbs.at(-1)?.path).toBe(realpathSync(source));
    expect(browseLibraryFolders({ path: root }).entries.some((entry) => entry.name === "作品")).toBe(true);
    const ws = new Workspace(join(root, "workspace"));
    expect(libraryProjects(ws)).toEqual([]);
    const copied = await addLibraryProject(ws, { path: source, mode: "copy" });
    const view = novelView(ws, copied.project);
    expect(view.data.documents).toHaveLength(3);
    expect(view.data.documents.find((d) => d.path.includes("人物卡"))?.classification?.role).toBe("setting");
    editNovel(ws, copied.project, view.revision, { type: "mode", mode: "writing" });
    const outline = novelView(ws, copied.project).data.scenes.find((s) => s.path === "分场大纲.md");
    if (!outline) throw new Error("未索引大纲");
    const sourceDoc = novelScene(ws, copied.project, outline.id);
    const revisedOutline = "# 新的第一场\n月下相遇\n# 第二场\n保留分别";
    saveNovelScene(ws, copied.project, novelView(ws, copied.project).revision, {
      scene: outline.id,
      fileHash: sourceDoc.anchor.fileHash,
      text: revisedOutline,
      wholeDocument: true,
    });
    expect(readFileSync(join(copied.sourceRoot, "分场大纲.md"), "utf8")).toBe(revisedOutline);
    expect(readFileSync(join(source, "分场大纲.md"), "utf8")).toBe("# 第一场\n相遇\n# 第二场\n分别");
    undoNovelScene(ws, copied.project, novelView(ws, copied.project).revision);
    expect(readFileSync(join(copied.sourceRoot, "分场大纲.md"), "utf8")).toBe(
      "# 第一场\n相遇\n# 第二场\n分别",
    );
    writeFileSync(join(copied.sourceRoot, "正文.md"), "在插件里修改");
    expect(readFileSync(join(source, "正文.md"), "utf8")).toBe("作者正在写的正文");
    setLibraryHidden(ws, copied.project, true);
    expect(libraryProjects(new Workspace(ws.root)).find((p) => p.slug === copied.project)?.hidden).toBe(true);
    setLibraryHidden(ws, copied.project, false);
    expect(libraryProjects(ws).find((p) => p.slug === copied.project)?.hidden).toBe(false);
    removeLibraryProject(ws, copied.project);
    expect(novelProjects(ws)).toEqual([]);
    const [trashName] = readdirSync(join(ws.root, ".kaitu/novel-trash"));
    if (!trashName) throw new Error("回收目录不存在");
    const trash = join(ws.root, ".kaitu/novel-trash", trashName);
    expect(readFileSync(join(trash, "作品副本/正文.md"), "utf8")).toBe("在插件里修改");
    const linked = await addLibraryProject(ws, { path: source, mode: "link" });
    expect(linked.sourceRoot).toBe(realpathSync(source));
    expect((await addLibraryProject(ws, { path: source, mode: "link" })).project).toBe(linked.project);
    removeLibraryProject(ws, linked.project);
    expect(readFileSync(join(source, "正文.md"), "utf8")).toBe("作者正在写的正文");
    expect(readdirSync(source)).toHaveLength(3);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
