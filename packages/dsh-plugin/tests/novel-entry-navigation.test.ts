import { describe, expect, it, vi } from "vitest";
import { createNovelEntryNavigation, createWorkspaceSession } from "../src/client/novel-entry-navigation.js";
import { browserRecentMemory, chooseEntry, recentEntries, type EntryCatalog, type EntrySession } from "../src/client/novel-entry-catalog.js";
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function fixture(shared = new Map<string, string>()) {
  let navigation = new AbortController();
  const rows: EntrySession<string>[] = [];
  const catalog: EntryCatalog<string> = { ready: true, sessions: rows };
  const listeners = new Set<() => void>();
  const storage = { getItem: (key: string) => shared.get(key) ?? null, setItem: (key: string, value: string) => { shared.set(key, value); } };
  let serial = 0;
  const services = {
    owner: {}, memory: browserRecentMemory(storage, "/"),
    beginNavigation: () => { navigation.abort(); navigation = new AbortController(); return navigation.signal; },
    pickDirectory: vi.fn(async (): Promise<string | null> => "/synthetic/book"),
    validateDirectory: vi.fn(async (path: string) => path.replace(/\/$/u, "")),
    refreshCatalog: vi.fn(async () => {}), catalog: () => catalog,
    subscribeCatalog: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    createSession: vi.fn(async (path: string) => { const id = `s${++serial}`; rows.push({ id, cwd: path, updatedAt: serial }); return id; }),
    openSession: vi.fn()
  };
  return { services, rows, catalog, shared, controller: createNovelEntryNavigation(services), leave: () => navigation.abort(), emit: () => { for (const listener of listeners) listener(); } };
}
const ticks = async () => { for (let n = 0; n < 5; n++) await Promise.resolve(); };
describe("native novel entry durable identity navigation", () => {
  it("uses the Host canonical path to recover an existing workspace Session", async () => {
    const f = fixture();
    f.rows.push({ id: "canonical", cwd: "/private/var/book", updatedAt: 1 });
    f.services.validateDirectory.mockImplementation(async () => "/private/var/book");
    await f.controller.open("/var/book");
    expect(f.services.openSession).toHaveBeenCalledExactlyOnceWith("canonical");
    expect(f.services.createSession).not.toHaveBeenCalled();
    expect(f.controller.getSnapshot().recent).toEqual([{ id: "canonical", path: "/private/var/book" }]);
  });

  it("restores recent IDs after a fresh instance, resumes the exact session and does not list unrelated history", async () => {
    const f = fixture(); await f.controller.open("/synthetic/one");
    f.rows.push({ id: "code", cwd: "/code", updatedAt: 500 });
    f.controller.dispose();
    const next = createNovelEntryNavigation({ ...f.services, memory: browserRecentMemory({ getItem: (k) => f.shared.get(k) ?? null, setItem: (k, v) => { f.shared.set(k, v); } }, "/") });
    await next.restore();
    expect(next.getSnapshot().recent).toEqual([{ id: "s1", path: "/synthetic/one" }]);
    await next.open("/synthetic/one/");
    expect(f.services.createSession).toHaveBeenCalledTimes(1);
    expect(f.services.openSession).toHaveBeenLastCalledWith("s1");
  });
  it("actively reselecting an unmarked old directory uses the latest exact root with a stable tie break", async () => {
    const f = fixture(); f.rows.push(
      { id: "other", cwd: "/other/book", updatedAt: 999 },
      { id: "child", cwd: "/book", updatedAt: 999, parentId: "a" },
      { id: "subagent", cwd: "/book", updatedAt: 999, origin: "subagent" },
      { id: "z", cwd: "/book", updatedAt: 2 }, { id: "a", cwd: "/book", updatedAt: 2 }
    );
    expect(f.controller.getSnapshot().recent).toEqual([]);
    await f.controller.open("/book");
    expect(f.services.openSession).toHaveBeenCalledExactlyOnceWith("a");
    expect(f.services.createSession).not.toHaveBeenCalled();
  });
  it("does not create while the host index is pending or refresh fails; allows later retry", async () => {
    const f = fixture(); f.catalog.ready = false;
    await f.controller.open("/book");
    expect(f.controller.getSnapshot().error).toMatch(/尚未加载/u);
    expect(f.services.createSession).not.toHaveBeenCalled();
    f.catalog.ready = true; f.services.refreshCatalog.mockRejectedValueOnce(new Error("offline"));
    await f.controller.open("/book"); expect(f.services.createSession).not.toHaveBeenCalled();
    await f.controller.open("/book"); expect(f.services.createSession).toHaveBeenCalledTimes(1);
  });
  it("waits for a delayed catalog baseline instead of duplicating its existing session", async () => {
    const f = fixture(); const refresh = deferred<void>(); f.catalog.ready = false;
    f.services.refreshCatalog.mockImplementationOnce(() => refresh.promise);
    const run = f.controller.open("/book"); await ticks();
    expect(f.services.createSession).not.toHaveBeenCalled();
    f.rows.push({ id: "durable", cwd: "/book", updatedAt: 1 }); f.catalog.ready = true; refresh.resolve(); await run;
    expect(f.services.openSession).toHaveBeenCalledExactlyOnceWith("durable");
  });
  it("filters missing/foreign/child IDs and never trusts browser paths", async () => {
    const f = fixture(); f.services.memory.write(["foreign", "child", "safe"], { id: "safe", path: "/real" });
    f.rows.push({ id: "child", cwd: "/book", parentId: "p", updatedAt: 1 }, { id: "safe", cwd: "/real", updatedAt: 1 });
    await f.controller.restore();
    expect(f.controller.getSnapshot().recent).toEqual([{ id: "safe", path: "/real" }]);
    await f.controller.open("/book"); expect(f.services.openSession).not.toHaveBeenCalledWith("child");
    expect(chooseEntry(f.catalog, "/different", ["safe"])).toBeUndefined();
  });
  it("never restores a saved ID whose host cwd changed to another book", async () => {
    const f = fixture(); await f.controller.open("/original");
    f.rows[0]!.cwd = "/another-book"; f.emit();
    expect(f.controller.getSnapshot().recent).toEqual([]);
    await f.controller.restore();
    expect(f.controller.getSnapshot().recent).toEqual([]);
    expect(f.services.openSession).toHaveBeenCalledTimes(1);
  });
  it("directory failures and unsupported persisted formats do not create replacements", async () => {
    const f = fixture(); f.services.validateDirectory.mockRejectedValueOnce(new Error("目录不存在"));
    await f.controller.open("/book"); expect(f.services.createSession).not.toHaveBeenCalled();
    f.rows.push({ id: "old-format", cwd: "/book", updatedAt: 1, formatStatus: "migration-required" });
    await f.controller.open("/book"); expect(f.services.createSession).not.toHaveBeenCalled();
    expect(f.controller.getSnapshot().error).toMatch(/未新建/u);
  });
  it("does not restore or silently replace an archived session", async () => {
    const f = fixture(); await f.controller.open("/book");
    f.rows[0]!.archived = true; f.emit();
    expect(f.controller.getSnapshot().recent).toEqual([]);
    await f.controller.open("/book");
    expect(f.services.createSession).toHaveBeenCalledTimes(1);
    expect(f.services.openSession).toHaveBeenCalledTimes(1);
    expect(f.controller.getSnapshot().error).toMatch(/未新建/u);
  });
  it("deduplicates repeated clicks plus cancel/remount/reselect while a create is in flight", async () => {
    const f = fixture(); const pending = deferred<string>();
    f.services.createSession.mockImplementation(() => pending.promise);
    const first = f.controller.open("/book"); await ticks();
    await f.controller.open("/book");
    f.controller.cancel();
    const next = createNovelEntryNavigation(f.services); const second = next.open("/book"); await ticks();
    expect(f.services.createSession).toHaveBeenCalledTimes(1);
    f.rows.push({ id: "created", cwd: "/book", updatedAt: 1 }); pending.resolve("created");
    await Promise.all([first, second]);
    expect(f.services.openSession).toHaveBeenCalledExactlyOnceWith("created");
  });
  it("fences late creation/error after navigation and preserves a newer operation", async () => {
    const f = fixture(); const old = deferred<string>(); f.services.createSession.mockImplementationOnce(() => old.promise);
    const run = f.controller.open("/old"); await ticks(); f.controller.cancel(); await f.controller.open("/new");
    old.reject(new Error("old failure")); await run;
    expect(f.services.openSession).toHaveBeenCalledExactlyOnceWith("s1");
    expect(f.controller.getSnapshot().error).toBeUndefined();
    const f2 = fixture(); const gate = deferred<void>(); f2.services.refreshCatalog.mockImplementationOnce(() => gate.promise);
    const leaving = f2.controller.open("/book"); await ticks(); f2.leave(); gate.resolve(); await leaving;
    expect(f2.services.createSession).not.toHaveBeenCalled();
  });
  it("handles picker cancellation, deletion and subscriptions without stale recent rows", async () => {
    const f = fixture(); f.services.pickDirectory.mockResolvedValueOnce(null); await f.controller.open();
    expect(f.services.createSession).not.toHaveBeenCalled();
    await f.controller.open("/book"); f.rows.length = 0; f.emit(); expect(f.controller.getSnapshot().recent).toEqual([]);
    const listener = vi.fn(); const stop = f.controller.subscribe(listener); stop(); f.controller.dispose(); f.emit(); expect(listener).not.toHaveBeenCalled();
  });
  it("degrades safely for blocked/malformed storage, isolates scopes and preserves pending markers", () => {
    const blocked = browserRecentMemory({ getItem() { throw new Error("blocked"); }, setItem() { throw new Error("quota"); } }, "/");
    blocked.write(["a"]); expect(blocked.read()).toEqual(["a"]);
    const f = fixture(); f.services.memory.write(["a"]);
    const alternate = browserRecentMemory({ getItem: (k) => f.shared.get(k) ?? null, setItem() {} }, "/other");
    expect(alternate.read()).toEqual([]);
    const bad = browserRecentMemory({ getItem: () => '{"path":"/private"}', setItem() {} }, "/"); expect(bad.read()).toEqual([]);
    expect(recentEntries({ ready: false, sessions: [{ id: "a", cwd: "/book", updatedAt: 1 }] }, ["a"], () => "/book")).toEqual([]);
    expect(f.services.memory.read()).toEqual(["a"]);
  });
});

describe("first-use native workspace creation", () => {
  it("registers the book before creating an attached Session, never cwd-only", async () => {
    const calls: string[] = [];
    const workspaces = { create: vi.fn(async (input: { path: string }) => { calls.push(input.path); return { workspaceId: "book-workspace" }; }) };
    const sessions = { create: vi.fn(async () => { calls.push("session"); return "book-session"; }) };
    await expect(createWorkspaceSession("/synthetic/book", workspaces, sessions)).resolves.toBe("book-session");
    expect(calls).toEqual(["/synthetic/book", "session"]);
    expect(sessions.create).toHaveBeenCalledExactlyOnceWith({ workspaceId: "book-workspace" });
  });
  it("does not create an ungrouped Session when the Host refuses the directory", async () => {
    const sessions = { create: vi.fn(async () => "must-not-exist") };
    await expect(createWorkspaceSession("/missing", { create: async () => { throw new Error("not a directory"); } }, sessions)).rejects.toThrow("not a directory");
    expect(sessions.create).not.toHaveBeenCalled();
  });
});
