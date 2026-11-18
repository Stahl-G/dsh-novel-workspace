import { afterEach, describe, expect, it } from "vitest";
import { Context } from "@deepseek-ai/cordis";
import { TypertRegistry } from "@deepseek-ai/dsh-typert-registry";
import { NovelRecentService } from "../src/novel-recent-service.js";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RECENT_FILENAME, readNovelRecent, touchNovelRecent, type RecentSessionRow } from "../src/novel-recent-store.js";
import { requireRecentOwner, novelRecentRemote, recentResponse } from "../src/novel-recent-contract.js";

const scratch: string[] = [];
afterEach(async () => { await Promise.all(scratch.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "kaitu-recent-test-")); scratch.push(root);
  const profile = join(root, "profile"); await mkdir(profile);
  const other = join(root, "other-profile"); await mkdir(other);
  const book = join(root, "合成月站"); await mkdir(book);
  const file = join(profile, RECENT_FILENAME);
  const rows: RecentSessionRow[] = [{ id: "one", cwd: book, formatStatus: "current" }];
  return { root, profile, other, book, file, rows, catalog: async () => rows };
}

describe("profile-owned recent novel pointers", () => {
  it("is empty before first explicit open, persists only ids and resolves paths from current catalog", async () => {
    const f = await fixture();
    expect(await readNovelRecent(f.profile, f.catalog)).toEqual({ entries: [] });
    expect(await readdir(f.profile)).toEqual([]);
    const expected = { entries: [{ id: "one", path: f.book }] };
    expect(await touchNovelRecent(f.profile, "one", f.catalog)).toEqual(expected);
    expect(JSON.parse(await readFile(f.file, "utf8"))).toEqual({ version: 1, ids: ["one"] });
    expect(await readNovelRecent(f.profile, f.catalog)).toEqual(expected);
    expect(await readNovelRecent(f.other, f.catalog)).toEqual({ entries: [] });
  });
  it("never derives the profile from a path supplied by a client and rejects unusable directories", async () => {
    const f = await fixture();
    await expect(touchNovelRecent("relative", "one", f.catalog)).rejects.toThrow();
    await expect(touchNovelRecent(join(f.root, "absent"), "one", f.catalog)).rejects.toThrow();
    expect(await readdir(f.profile)).toEqual([]);
  });
  it("rejects child, archived, migration-required, missing and non-directory sessions without writing", async () => {
    const f = await fixture();
    await touchNovelRecent(f.profile, "one", f.catalog);
    const before = await readFile(f.file, "utf8");
    const plainFile = join(f.root, "not-a-directory"); await writeFile(plainFile, "synthetic");
    const invalid: RecentSessionRow[] = [
      { id: "child", cwd: f.book, parentId: "one" }, { id: "agent", cwd: f.book, origin: "subagent" },
      { id: "archived", cwd: f.book, archived: true }, { id: "old", cwd: f.book, formatStatus: "migration-required" },
      { id: "relative", cwd: "relative" }, { id: "gone", cwd: join(f.root, "gone") }, { id: "file", cwd: plainFile }
    ];
    f.rows.push(...invalid);
    for (const row of invalid) await expect(touchNovelRecent(f.profile, row.id, f.catalog)).rejects.toThrow();
    await expect(touchNovelRecent(f.profile, "missing", f.catalog)).rejects.toThrow();
    expect(await readFile(f.file, "utf8")).toBe(before);
    f.rows[0] = { id: "one", cwd: f.book, archived: true };
    expect(await readNovelRecent(f.profile, f.catalog)).toEqual({ entries: [] });
    expect(await readFile(f.file, "utf8")).toBe(before); // A filtered read is not a destructive repair.
  });
  it("does not overwrite healthy records when the current catalog fails", async () => {
    const f = await fixture(); await touchNovelRecent(f.profile, "one", f.catalog);
    const before = await readFile(f.file, "utf8");
    const unavailable = async (): Promise<readonly RecentSessionRow[]> => { throw new Error("catalog unavailable"); };
    await expect(readNovelRecent(f.profile, unavailable)).rejects.toThrow("catalog unavailable");
    await expect(touchNovelRecent(f.profile, "one", unavailable)).rejects.toThrow("catalog unavailable");
    expect(await readFile(f.file, "utf8")).toBe(before);
  });
  it("rejects malformed, overlarge and linked storage instead of erasing it", async () => {
    const f = await fixture();
    for (const value of ["not json", JSON.stringify({ version: 1, ids: ["one"], path: f.book }), "x".repeat(8193)]) {
      await writeFile(f.file, value);
      await expect(touchNovelRecent(f.profile, "one", f.catalog)).rejects.toThrow();
      expect(await readFile(f.file, "utf8")).toBe(value);
    }
    const invalidUtf8 = Buffer.from([0x7b, 0xc3, 0x28, 0x7d]);
    await writeFile(f.file, invalidUtf8);
    await expect(touchNovelRecent(f.profile, "one", f.catalog)).rejects.toThrow();
    expect(await readFile(f.file)).toEqual(invalidUtf8);
    await rm(f.file);
    const outside = join(f.root, "unrelated"); await writeFile(outside, "untouched"); await symlink(outside, f.file);
    await expect(readNovelRecent(f.profile, f.catalog)).rejects.toThrow();
    await expect(touchNovelRecent(f.profile, "one", f.catalog)).rejects.toThrow();
    expect(await readFile(outside, "utf8")).toBe("untouched");
  });
  it("serializes concurrent opens and limits pointers to eight distinct directories", async () => {
    const f = await fixture();
    for (let index = 2; index <= 10; index++) {
      const cwd = join(f.root, `book-${String(index)}`); await mkdir(cwd); f.rows.push({ id: String(index), cwd });
    }
    await Promise.all(f.rows.map((row) => touchNovelRecent(f.profile, row.id, f.catalog)));
    const result = await readNovelRecent(f.profile, f.catalog);
    expect(result.entries).toHaveLength(8);
    expect(new Set(result.entries.map((entry) => entry.id)).size).toBe(8);
    f.rows.push({ id: "alias-session", cwd: f.book });
    await touchNovelRecent(f.profile, "one", f.catalog);
    const alias = await touchNovelRecent(f.profile, "alias-session", f.catalog);
    expect(alias.entries.filter((entry) => entry.path === f.book)).toEqual([{ id: "alias-session", path: f.book }]);
    expect((await readdir(f.profile)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });
});

describe("owner-only fixed RPC boundary", () => {
  const invocation = (kind: string, args: object) => ({ peer: { principal: { kind } }, request: { args } });
  it("denies absent and non-owner peers and arbitrary key/profile/path parameters", () => {
    expect(() => requireRecentOwner(undefined, [])).toThrow();
    expect(() => requireRecentOwner(invocation("guest", {}), [])).toThrow();
    for (const key of ["path", "profile", "key", "principal"]) expect(() => requireRecentOwner(invocation("owner", { sessionId: "one", [key]: "ignored" }), ["sessionId"])).toThrow();
    expect(() => requireRecentOwner(invocation("owner", {}), [])).not.toThrow();
    expect(() => requireRecentOwner(invocation("owner", { sessionId: "one" }), ["sessionId"])).not.toThrow();
  });
  it("exposes exactly read and touch(sessionId), with a bounded validated result", () => {
    expect(novelRecentRemote.descriptors.map((descriptor) => [descriptor.namespace, descriptor.method, descriptor.parameters.map((parameter) => parameter.wire)])).toEqual([
      ["kaituNovelRecent", "read", []], ["kaituNovelRecent", "touch", ["sessionId"]]
    ]);
    expect(recentResponse.safeParse({ entries: [], profile: "secret" }).success).toBe(false);
  });
});


it("registers strict native Remote descriptors and refuses direct invocation without a peer", async () => {
  const context = new Context();
  new TypertRegistry(context);
  const service = new NovelRecentService(context);
  try {
    expect(context.typert.local.list().map((descriptor) => descriptor.method)).toEqual(["read", "touch"]);
    expect(service.typertRemote.namespace).toBe("kaituNovelRecent");
    await expect(service.read()).rejects.toThrow("已登录");
    await expect(service.touch("one")).rejects.toThrow("已登录");
  } finally { await context.fiber.dispose(); }
});
