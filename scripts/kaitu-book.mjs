#!/usr/bin/env node
/* global process */
import { constants } from "node:fs";
import { lstat, mkdir, mkdtemp, open, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL, URL } from "node:url";
import { TextDecoder } from "node:util";

export async function creativeAgreementTemplate() {
  // The packaged CLI lives in scripts/, alongside templates/ at the package root.
  for (const relative of ["../templates/creative-brief.md", "../packages/dsh-plugin/templates/creative-brief.md"]) {
    try { return await readFile(new URL(relative, import.meta.url), "utf8"); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  throw new Error("未找到随包创作约定模板；请重新构建插件。");
}

const HELP = `准备旧稿副本（不修改原稿，不调用模型）

  node scripts/kaitu-book.mjs prepare --source <稿件.md或.txt> --destination <全新目录> [--with-creative-brief]

只接收一个明确指定的 UTF-8 普通文件，不猜章节、不迁移旧插件数据。
目标父目录须已存在；目标目录即使为空也不覆盖，不能使用符号链接稿件。
完成后在 DSH 打开新目录，把 导入原文/稿件.md 或 .txt 交给 /story-import。
只有 --with-creative-brief 会创建可选的 设定/创作约定.md 模板；短篇通常不需要。
此命令只准备副本，未完成分析、分章或追踪初始化。
`;

async function absent(target) {
  try { await lstat(target); }
  catch (error) { if (error.code === "ENOENT") return; throw error; }
  throw new Error("目标已经存在，不能覆盖；请指定一个全新的目录。");
}

async function canonicalLeaf(input) {
  const absolute = path.resolve(input);
  const parent = await realpath(path.dirname(absolute));
  return path.join(parent, path.basename(absolute));
}

function sameFile(a, b) {
  return a.dev === b.dev && a.ino === b.ino;
}

async function manuscriptBytes(source) {
  const before = await lstat(source);
  if (!before.isFile() || before.isSymbolicLink()) throw new Error("原稿必须是普通文件，不能是目录或符号链接。");
  const handle = await open(source, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = await handle.stat();
    if (!sameFile(before, opened)) throw new Error("原稿在读取前发生变化，请重试。");
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (!sameFile(after, opened) || after.size !== opened.size || after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs)
      throw new Error("原稿在读取时发生变化，请重试。");
    try { new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch { throw new Error("原稿不是有效的 UTF-8 文本，请先在原编辑器另存为 UTF-8。"); }
    if (bytes.includes(0)) throw new Error("原稿包含二进制空字节，请提供 UTF-8 文本。");
    return bytes;
  } finally { await handle.close(); }
}

/** A copy preparation step, never an Oh Story analysis or an old-schema migration. */
export async function prepareBook({ source, destination, withCreativeBrief = false }) {
  if (typeof source !== "string" || !source.trim() || typeof destination !== "string" || !destination.trim())
    throw new Error("必须同时指定 --source 和 --destination。");
  const extension = path.extname(source).toLowerCase();
  if (![".md", ".txt"].includes(extension)) throw new Error("只支持 .md 或 .txt 稿件。");
  // Canonical parents make aliases (including macOS /tmp) unambiguous. The source
  // leaf itself is never dereferenced, and the destination must not exist at all.
  const input = await canonicalLeaf(source);
  const output = await canonicalLeaf(destination);
  const fromOutput = path.relative(output, input);
  if (fromOutput === "" || (!fromOutput.startsWith(`..${path.sep}`) && fromOutput !== ".." && !path.isAbsolute(fromOutput)))
    throw new Error("新目录不能是原稿或包含原稿的目录。");
  await absent(output);
  const bytes = await manuscriptBytes(input);
  const template = withCreativeBrief ? await creativeAgreementTemplate() : undefined;
  const stage = await mkdtemp(path.join(path.dirname(output), ".kaitu-book-"));
  let ownedOutput;
  let complete = false;
  try {
    await mkdir(path.join(stage, "导入原文"));
    if (withCreativeBrief) await mkdir(path.join(stage, "设定"));
    const copiedPath = `导入原文/稿件${extension}`;
    await writeFile(path.join(stage, copiedPath), bytes, { flag: "wx" });
    if (withCreativeBrief) await writeFile(path.join(stage, "设定", "创作约定.md"), template, { flag: "wx" });
    await writeFile(path.join(stage, "导入说明.md"), `# 旧稿副本已准备\n\n原稿未修改。此目录还不是已完成导入的小说工程。\n\n1. 在 DSH 打开这个目录。\n2. ${withCreativeBrief ? "可选：填写 设定/创作约定.md，空白项保持待定。" : "此副本未创建创作约定。需要时再请助手建立，不必改变短篇的三文件结构。"}\n3. 发送：\n\n> /story-import 请将 ${copiedPath} 整理成可续写工程，先确认书名、长短篇、范围与最后一章是否完整。保留这份副本，不改原始稿件。${withCreativeBrief ? "已有的 设定/创作约定.md 不得被初始化覆盖；先读取，确认书目录后保留到同一书目录。" : ""}\n\n这里只复制了文本，没有调用模型、反推大纲、初始化追踪或认定作者文风。\n`, { flag: "wx" });
    // mkdir is the portable no-clobber reservation. All content is prepared first;
    // completion is marked last. Do not use rename(stage, output), which can
    // silently replace a concurrently-created empty directory on POSIX.
    await mkdir(output);
    ownedOutput = await lstat(output);
    for (const name of ["导入原文", ...(withCreativeBrief ? ["设定"] : []), "导入说明.md"]) await rename(path.join(stage, name), path.join(output, name));
    await writeFile(path.join(output, ".kaitu-copy-ready"), "copy-only\n", { flag: "wx" });
    complete = true;
    return { directory: output, manuscript: copiedPath, status: "copy-only" };
  } finally {
    await rm(stage, { recursive: true, force: true });
    if (!complete && ownedOutput) {
      // Only remove the directory this operation reserved, never another target.
      const current = await lstat(output).catch(() => undefined);
      if (current && sameFile(current, ownedOutput)) await rm(output, { recursive: true, force: true });
    }
  }
}

export async function main(args) {
  if (args.length === 0 || (args.length === 1 && ["--help", "-h"].includes(args[0]))) return HELP;
  if (args[0] !== "prepare") throw new Error("只支持 prepare；使用 --help 查看用法。");
  const options = {};
  for (let index = 1; index < args.length; index += 2) {
    const key = args[index];
    if (key === "--with-creative-brief") {
      if (options.withCreativeBrief) throw new Error("参数重复：--with-creative-brief。");
      options.withCreativeBrief = true;
      index -= 1;
      continue;
    }
    if (!["--source", "--destination"].includes(key) || options[key.slice(2)] !== undefined)
      throw new Error("参数未知或重复；使用 --help 查看用法。");
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${key} 缺少路径。`);
    options[key.slice(2)] = value;
  }
  const result = await prepareBook(options);
  return `旧稿副本已准备：${result.directory}\n原稿未改动。下一步在 DSH 打开此目录，按 导入说明.md 运行 /story-import。\n`;
}

const invokedFile = process.argv[1] ? await realpath(process.argv[1]).catch(() => undefined) : undefined;
if (invokedFile && import.meta.url === pathToFileURL(invokedFile).href) {
  main(process.argv.slice(2)).then((message) => process.stdout.write(message)).catch((error) => {
    process.stderr.write(`未完成：${error.message}\n`);
    process.exitCode = 1;
  });
}
