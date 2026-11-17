/* global structuredClone */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { prepareBook } from "./kaitu-book.mjs";
import { checkDeclaredDuration } from "./kaitu-duration-check.mjs";

// Public synthetic text, not a user manuscript, model output or imported canon.
const manuscript = "# 合成样稿：环廊\n\n设定：匀速行走且不停留时，环廊每圈恰好需要 8 分钟。\n\n她不停留地匀速走了 2 圈，钟上过去了 19 分钟。她把茶杯放在扶手旁。\n";
function claims() {
  // A human explicitly extracted and confirmed these values for this test.
  // No NLP extraction or automatic confirmation is implemented or claimed.
  return {
    rule: { confirmed: true, scope: "环廊匀速不停留", unit: "minute", minutesPerCycle: 8, quote: "环廊每圈恰好需要 8 分钟" },
    scene: { confirmed: true, scope: "环廊匀速不停留", unit: "minute", cycles: 2, elapsedMinutes: 19, constantDuration: true, extraDelayMinutes: 0, exception: "none", quote: "她不停留地匀速走了 2 圈，钟上过去了 19 分钟" }
  };
}
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "kaitu-author-loop-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = path.join(root, "作者原稿.md");
  await writeFile(source, manuscript, { flag: "wx" });
  const sourceHash = digest(await readFile(source));
  const book = await prepareBook({ source, destination: path.join(root, "复制工作区") });
  return { root, source, sourceHash, book, copied: path.join(book.directory, book.manuscript) };
}
async function unchanged(f) {
  assert.equal(digest(await readFile(f.source)), f.sourceHash);
  assert.equal(digest(await readFile(f.copied)), f.sourceHash);
}

test("copy → explicit internal-rule review → reject: original and copy remain byte-identical", async (t) => {
  const f = await fixture(t);
  assert.equal(f.book.status, "copy-only");
  const result = checkDeclaredDuration(claims());
  assert.equal(result.status, "conflict");
  assert.equal(result.expectedMinutes, 16);
  assert.equal(result.observedMinutes, 19);
  const report = `# 合成审稿报告\n\n已检查：${result.equation}，正文为 19 分钟。\n依据：${result.evidence.rule}；${result.evidence.scene}。\n${result.caveat}\n\n可选方案：保持条件，把 19 改为 16；或由作者修改情境以解释额外 3 分钟；也可保持原文待定。未采纳。\n\n语法建议（人工演示，非错误判定）：可把“钟上过去了”换成“钟面显示已过去”。\n创意建议（人工演示，非正史）：可考虑一次停步，但作者没有决定，不写入正文或设定。\n`;
  await writeFile(path.join(f.book.directory, "审稿建议.md"), report, { flag: "wx" });
  await unchanged(f);
  // The simulated author rejects the suggestions. This is a test decision,
  // not a UI approval handler or a grant of permission to edit real manuscripts.
  const authorDecision = "reject";
  assert.equal(authorDecision, "reject");
  assert.ok(!(await readdir(f.book.directory)).includes("修订副本"));
  await unchanged(f);
  assert.match(await readFile(path.join(f.book.directory, "导入说明.md"), "utf8"), /没有调用模型/);
});

test("author manually accepts the arithmetic edit into a new revision copy, never the source", async (t) => {
  const f = await fixture(t);
  const result = checkDeclaredDuration(claims());
  assert.equal(result.status, "conflict");
  await unchanged(f);
  const authorDecision = "accept-arithmetic-only";
  assert.equal(authorDecision, "accept-arithmetic-only");
  // Demonstrates the author saving a NEW file; not an automatic adoption API.
  const revisionDir = path.join(f.book.directory, "修订副本");
  await mkdir(revisionDir);
  const revision = path.join(revisionDir, "环廊-作者修订.md");
  const revised = (await readFile(f.copied, "utf8")).replace("钟上过去了 19 分钟", "钟上过去了 16 分钟");
  await writeFile(revision, revised, { flag: "wx" });
  assert.equal(await readFile(revision, "utf8"), manuscript.replace("19 分钟", "16 分钟"));
  assert.match(revised, /钟上过去了/); // grammar suggestion was not accepted
  assert.doesNotMatch(revised, /停步了|停留了 3 分钟/); // creative idea is not canon
  await unchanged(f);
  await assert.rejects(writeFile(revision, "cannot overwrite", { flag: "wx" }), { code: "EEXIST" });
  assert.equal(await readFile(revision, "utf8"), revised);
  const corrected = claims();
  corrected.scene.elapsedMinutes = 16;
  corrected.scene.quote = "她不停留地匀速走了 2 圈，钟上过去了 16 分钟";
  assert.equal(checkDeclaredDuration(corrected).status, "consistent");
  await unchanged(f);
});

test("unknown facts, units, scope, approximate values and fictional exceptions abstain", () => {
  const cases = [
    (c) => { c.rule.confirmed = false; },
    (c) => { c.scene.confirmed = false; },
    (c) => { c.rule.minutesPerCycle = null; },
    (c) => { c.rule.minutesPerCycle = "约8"; },
    (c) => { c.rule.minutesPerCycle = 8.5; },
    (c) => { c.scene.cycles = -2; },
    (c) => { c.scene.elapsedMinutes = NaN; },
    (c) => { c.rule.unit = "fictional-time-unit"; },
    (c) => { c.scene.unit = "second"; },
    (c) => { c.scene.scope = "另一个环廊"; },
    (c) => { c.scene.constantDuration = undefined; },
    (c) => { c.scene.extraDelayMinutes = null; },
    (c) => { c.scene.extraDelayMinutes = 3; },
    (c) => { c.scene.exception = "虚构局部时间扭曲"; },
    (c) => { delete c.scene.exception; },
    (c) => { c.rule.quote = ""; },
    (c) => { c.rule.minutesPerCycle = Number.MAX_SAFE_INTEGER; }
  ];
  for (const mutate of cases) {
    const c = claims();
    mutate(c);
    const before = structuredClone(c);
    const result = checkDeclaredDuration(c);
    assert.equal(result.status, "not-checked");
    assert.ok(result.reason);
    assert.equal(result.expectedMinutes, undefined);
    assert.deepEqual(c, before); // the checker has no adoption or mutation behavior
  }
  assert.equal(checkDeclaredDuration().status, "not-checked");
});

test("review-only checking leaves no files and returns a literary, not scientific, consistency result", async (t) => {
  const f = await fixture(t);
  const before = await readdir(f.book.directory);
  const c = claims();
  const snapshot = structuredClone(c);
  const result = checkDeclaredDuration(c);
  assert.equal(result.basis, "declared-world-rule");
  assert.match(result.caveat, /不是现实科学事实/);
  assert.match(result.caveat, /未自动理解或验证引文/);
  assert.deepEqual(c, snapshot);
  assert.deepEqual(await readdir(f.book.directory), before);
  await assert.rejects(access(path.join(f.book.directory, "追踪")));
  await unchanged(f);
});
