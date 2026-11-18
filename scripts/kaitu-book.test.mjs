/* global Buffer, process */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, URL } from "node:url";
import { promisify } from "node:util";
import { creativeAgreementTemplate, main, prepareBook } from "./kaitu-book.mjs";

const exec = promisify(execFile);
const cli = fileURLToPath(new URL("./kaitu-book.mjs", import.meta.url));
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "kaitu-copy-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = path.join(root, "月站旧稿.md");
  const bytes = Buffer.from("\ufeff# 第一章\r\n月站早餐还热着。🛰️\r\n");
  await writeFile(source, bytes);
  return { root, source, bytes, destination: path.join(root, "新工程") };
}

test("CLI copies non-ASCII/BOM/CRLF bytes without modifying the source or claiming analysis", async (t) => {
  const f = await fixture(t);
  const result = await exec(process.execPath, [cli, "prepare", "--source", f.source, "--destination", f.destination, "--with-creative-brief"]);
  assert.match(result.stdout, /副本已准备/);
  assert.deepEqual(await readFile(f.source), f.bytes);
  assert.deepEqual(await readFile(path.join(f.destination, "导入原文", "稿件.md")), f.bytes);
  assert.equal(await readFile(path.join(f.destination, "设定", "创作约定.md"), "utf8"), await creativeAgreementTemplate());
  assert.match(await readFile(path.join(f.destination, "导入说明.md"), "utf8"), /没有调用模型/);
  assert.equal(await readFile(path.join(f.destination, ".kaitu-copy-ready"), "utf8"), "copy-only\n");
  assert.ok(!(await readdir(f.root)).some((name) => name.startsWith(".kaitu-book-")));
});

test("TXT is copied explicitly, with no inferred chapter or author style", async (t) => {
  const f = await fixture(t);
  const source = path.join(f.root, "candidate.TXT");
  await writeFile(source, "AI 候选：这是合成的测试文本。");
  const result = await prepareBook({ source, destination: f.destination });
  assert.equal(result.manuscript, "导入原文/稿件.txt");
  assert.match(await creativeAgreementTemplate(), /AI 候选/);
  assert.ok(!(await readdir(f.destination)).includes("设定"));
  assert.ok(!(await readdir(f.destination)).includes("正文"));
});

test("retry and existing empty or populated targets are never overwritten", async (t) => {
  const f = await fixture(t);
  await prepareBook(f);
  await assert.rejects(prepareBook(f), /目标已经存在/);
  const empty = path.join(f.root, "empty");
  await mkdir(empty);
  await assert.rejects(prepareBook({ source: f.source, destination: empty }), /目标已经存在/);
  assert.deepEqual(await readdir(empty), []);
  assert.deepEqual(await readFile(f.source), f.bytes);
});

test("source and destination aliases cannot overwrite original manuscripts", async (t) => {
  const f = await fixture(t);
  await assert.rejects(prepareBook({ source: f.source, destination: f.source }), /不能是原稿/);
  await assert.rejects(prepareBook({ source: f.source, destination: f.root }), /不能是原稿/);
  const link = path.join(f.root, "linked.md");
  await symlink(f.source, link);
  await assert.rejects(prepareBook({ source: link, destination: f.destination }), /符号链接/);
  const dangling = path.join(f.root, "dangling");
  await symlink(path.join(f.root, "absent"), dangling, "dir");
  await assert.rejects(prepareBook({ source: f.source, destination: dangling }), /目标已经存在/);
  assert.deepEqual(await readFile(f.source), f.bytes);
});

test("bad UTF-8, binary content, directory and unsupported inputs leave no incomplete project", async (t) => {
  const f = await fixture(t);
  for (const bytes of [Buffer.from([0xc3, 0x28]), Buffer.from([0x61, 0, 0x62])]) {
    const bad = path.join(f.root, "bad.txt");
    await writeFile(bad, bytes);
    await assert.rejects(prepareBook({ source: bad, destination: f.destination }), /UTF-8/);
    assert.ok(!(await readdir(f.root)).includes("新工程"));
  }
  const directory = path.join(f.root, "folder.md");
  await mkdir(directory);
  await assert.rejects(prepareBook({ source: directory, destination: f.destination }), /普通文件/);
  await assert.rejects(prepareBook({ source: "book.docx", destination: f.destination }), /只支持/);
  assert.ok(!(await readdir(f.root)).some((name) => name.startsWith(".kaitu-book-")));
});

test("two simultaneous preparations can only publish one complete copy", async (t) => {
  const f = await fixture(t);
  const results = await Promise.allSettled([prepareBook(f), prepareBook(f)]);
  assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(results.filter((item) => item.status === "rejected").length, 1);
  assert.deepEqual(await readFile(path.join(f.destination, "导入原文", "稿件.md")), f.bytes);
  assert.equal(await readFile(path.join(f.destination, ".kaitu-copy-ready"), "utf8"), "copy-only\n");
  assert.ok(!(await readdir(f.root)).some((name) => name.startsWith(".kaitu-book-")));
});

test("CLI validates options without touching a workspace", async () => {
  assert.match(await main(["--help"]), /只准备副本/);
  await assert.rejects(main(["unknown"]), /只支持 prepare/);
  await assert.rejects(main(["prepare", "--source"]), /缺少路径/);
  await assert.rejects(main(["prepare", "--source", "x.md", "--source", "y.md"]), /重复/);
  await assert.rejects(main(["prepare", "--source", "x.md"]), /必须同时/);
  await assert.rejects(main(["prepare", "--wat", "x"]), /未知/);
  const result = await exec(process.execPath, [cli, "--help"]);
  assert.match(result.stdout, /不修改原稿/);
});


test("packaged CLI reads the same single template from templates/", async (t) => {
  const f = await fixture(t);
  const pkg = path.join(f.root, "package");
  await mkdir(path.join(pkg, "scripts"), { recursive: true });
  await mkdir(path.join(pkg, "templates"));
  const packagedCli = path.join(pkg, "scripts", "kaitu-book.mjs");
  await copyFile(cli, packagedCli);
  await writeFile(path.join(pkg, "templates", "creative-brief.md"), await creativeAgreementTemplate());
  await exec(process.execPath, [packagedCli, "prepare", "--with-creative-brief", "--source", f.source, "--destination", f.destination]);
  assert.equal(await readFile(path.join(f.destination, "设定", "创作约定.md"), "utf8"), await creativeAgreementTemplate());
});

test("missing packaged optional template fails without creating any project", async (t) => {
  const f = await fixture(t);
  const pkg = path.join(f.root, "package");
  await mkdir(path.join(pkg, "scripts"), { recursive: true });
  const packagedCli = path.join(pkg, "scripts", "kaitu-book.mjs");
  await copyFile(cli, packagedCli);
  await assert.rejects(exec(process.execPath, [packagedCli, "prepare", "--with-creative-brief", "--source", f.source, "--destination", f.destination]), /未找到随包创作约定模板/);
  assert.ok(!(await readdir(f.root)).includes("新工程"));
  assert.deepEqual(await readFile(f.source), f.bytes);
});
