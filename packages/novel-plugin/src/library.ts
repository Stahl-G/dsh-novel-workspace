import { randomUUID } from "node:crypto";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  renameSync,
  statSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path";
import {
  type Workspace,
  connectNovel,
  createProject,
  initWorkspace,
  novelProjects,
  novelView,
  projectDirectory,
} from "@kaitu/core";
import { z } from "zod";

const file = ".kaitu/novel-library.json";
type Library = { hidden: string[]; copies: Record<string, string> };
const read = (ws: Workspace): Library => (ws.exists(file) ? ws.readJson(file) : { hidden: [], copies: {} });
const write = (ws: Workspace, data: Library) => ws.writeJson(file, data, { internal: true });

export function libraryProjects(ws: Workspace) {
  const library = read(ws);
  if (!ws.exists(".kaitu/config.json")) return [];
  return novelProjects(ws).map((p) => ({ ...p, hidden: library.hidden.includes(p.slug) }));
}

export async function addLibraryProject(ws: Workspace, input: unknown) {
  const options = z
    .object({
      path: z.string().trim().min(1),
      title: z.string().trim().optional(),
      mode: z.enum(["copy", "link"]).default("copy"),
    })
    .parse(input);
  const original = realpathSync(options.path);
  if (!statSync(original).isDirectory()) throw new Error("请选择作品文件夹");
  if (!ws.exists(".kaitu/config.json")) await initWorkspace(ws.root);
  const libraryRoot = ws.resolve(".kaitu/novel-library", { internal: true });
  const rel = relative(original, libraryRoot);
  if (rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".."))
    throw new Error("请选择作品文件夹，不要选择插件工作区的上层目录");
  const library = read(ws);
  if (options.mode === "link") {
    const existing = libraryProjects(ws).find(
      (p) => p.linked && novelView(ws, p.slug).data.sourceRoot === original,
    );
    if (existing) {
      setLibraryHidden(ws, existing.slug, false);
      return { project: existing.slug, sourceRoot: original };
    }
  }
  const sourceRoot = options.mode === "copy" ? join(libraryRoot, randomUUID(), basename(original)) : original;
  if (options.mode === "copy") {
    mkdirSync(libraryRoot, { recursive: true });
    cpSync(original, sourceRoot, {
      recursive: true,
      filter: (path) => {
        const name = basename(path);
        return (
          ![".git", ".obsidian", "node_modules", ".DS_Store", ".kaitu"].includes(name) &&
          !lstatSync(path).isSymbolicLink()
        );
      },
      dereference: false,
    });
  }
  const { slug } = await createProject(ws, {
    title: options.title || basename(original),
    kind: "personal",
    local_only: true,
    links: [{ path: sourceRoot, role: "manuscript" }],
  });
  connectNovel(ws, {
    project: slug,
    sourceRoot,
    mode: "headings",
    preview: false,
    include: ["**/*.md", "**/*.txt", "**/*.docx"],
    exclude: ["archive/**", "archived/**", "**/archive/**", "**/archived/**", "图片/**", "**/.*/**"],
  });
  if (options.mode === "copy") library.copies[slug] = sourceRoot;
  write(ws, library);
  return { project: slug, sourceRoot };
}

export function setLibraryHidden(ws: Workspace, project: string, hidden: boolean) {
  projectDirectory(ws, project);
  const library = read(ws);
  library.hidden = library.hidden.filter((p) => p !== project);
  if (hidden) library.hidden.push(project);
  write(ws, library);
  return { hidden };
}

export function removeLibraryProject(ws: Workspace, project: string) {
  const directory = ws.resolve(projectDirectory(ws, project), { internal: true });
  const view = novelProjects(ws).find((p) => p.slug === project)?.linked ? novelView(ws, project) : null;
  const library = read(ws);
  const trash = ws.resolve(`.kaitu/novel-trash/${project}-${Date.now()}`, { internal: true });
  mkdirSync(trash, { recursive: true });
  if (existsSync(directory)) renameSync(directory, join(trash, "project"));
  if (view && existsSync(view.data.managedRoot)) renameSync(view.data.managedRoot, join(trash, "资料"));
  const copy = library.copies[project];
  if (copy && existsSync(copy)) renameSync(copy, join(trash, "作品副本"));
  delete library.copies[project];
  library.hidden = library.hidden.filter((p) => p !== project);
  write(ws, library);
  return { removed: true };
}

export function browseLibraryFolders(input: unknown) {
  const { path } = z.object({ path: z.string().optional() }).parse(input);
  const requested = path?.replace(/^~(?=\/|$)/, homedir()) || homedir();
  if (!isAbsolute(requested)) throw new Error("请输入完整文件夹路径");
  const current = realpathSync(requested);
  if (!statSync(current).isDirectory()) throw new Error("请选择文件夹");
  const directories = readdirSync(current, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));
  const crumbs = [];
  let ancestor = current;
  while (true) {
    crumbs.unshift({ name: basename(ancestor) || ancestor, path: ancestor });
    const parent = dirname(ancestor);
    if (parent === ancestor) break;
    ancestor = parent;
  }
  return {
    path: current,
    home: homedir(),
    crumbs,
    entries: directories.slice(0, 300).map((entry) => ({
      name: entry.name,
      path: join(current, entry.name),
      hidden: entry.name.startsWith("."),
    })),
    truncated: directories.length > 300,
  };
}
