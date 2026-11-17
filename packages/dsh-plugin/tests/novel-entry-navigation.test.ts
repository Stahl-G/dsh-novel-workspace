import { describe, expect, it, vi } from "vitest";
import { createNovelEntryNavigation } from "../src/client/novel-entry-navigation.js";
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function fixture() {
  let navigation = new AbortController();
  const known = new Set<string>();
  const services = {
    beginNavigation: () => { navigation.abort(); navigation = new AbortController(); return navigation.signal; },
    pickDirectory: vi.fn(async () => "/synthetic/book"),
    createSession: vi.fn(async (path: string) => { const id = "session:" + path; known.add(id); return id; }),
    openSession: vi.fn(),
    sessionExists: (id: string) => known.has(id)
  };
  return { services, known, controller: createNovelEntryNavigation(services), leave: () => navigation.abort() };
}
describe("native novel entry navigation", () => {
  it("opens a native session, reuses it on return, and switches books without a second runtime", async () => {
    const f = fixture();
    await f.controller.open("/synthetic/one");
    await f.controller.open("/synthetic/two");
    await f.controller.open("/synthetic/one");
    expect(f.services.createSession).toHaveBeenCalledTimes(2);
    expect(f.services.openSession.mock.calls.map(([id]) => id)).toEqual(["session:/synthetic/one", "session:/synthetic/two", "session:/synthetic/one"]);
    expect(f.controller.getSnapshot().recent.map(({ path }) => path)).toEqual(["/synthetic/one", "/synthetic/two"]);
  });
  it("does not create or navigate after a directory chooser is cancelled", async () => {
    const f = fixture();
    f.services.pickDirectory = vi.fn(async () => null as unknown as string);
    await f.controller.open();
    expect(f.services.createSession).not.toHaveBeenCalled();
    expect(f.controller.getSnapshot().busy).toBe(false);
  });
  it("deduplicates repeated clicks and ignores a result after explicit cancellation", async () => {
    const f = fixture(); const pending = deferred<string>();
    f.services.createSession.mockImplementation(() => pending.promise);
    const first = f.controller.open("/synthetic/one");
    await f.controller.open("/synthetic/one");
    expect(f.services.createSession).toHaveBeenCalledTimes(1);
    f.controller.cancel();
    pending.resolve("not-opened"); await first;
    expect(f.services.openSession).not.toHaveBeenCalled();
    expect(f.controller.getSnapshot().recent).toEqual([]);
  });
  it("keeps a newer operation when a cancelled create returns later", async () => {
    const f = fixture(); const old = deferred<string>();
    f.services.createSession.mockImplementationOnce(() => old.promise);
    const oldRun = f.controller.open("/synthetic/old");
    f.controller.cancel();
    await f.controller.open("/synthetic/new");
    old.resolve("old"); await oldRun;
    expect(f.services.openSession).toHaveBeenCalledExactlyOnceWith("session:/synthetic/new");
    expect(f.controller.getSnapshot().recent[0]?.path).toBe("/synthetic/new");
  });
  it("honours later host navigation, including leaving or returning to another panel", async () => {
    const f = fixture(); const pending = deferred<string>();
    f.services.createSession.mockImplementationOnce(() => pending.promise);
    const run = f.controller.open("/synthetic/one"); f.leave(); pending.resolve("late"); await run;
    expect(f.services.openSession).not.toHaveBeenCalled();
  });
  it("shows current failures, permits retry and recreates removed session identities", async () => {
    const f = fixture();
    f.services.createSession.mockRejectedValueOnce(new Error("目录不可访问"));
    await f.controller.open("/synthetic/one");
    expect(f.controller.getSnapshot().error).toBe("目录不可访问");
    await f.controller.open("/synthetic/one");
    expect(f.controller.getSnapshot().error).toBeUndefined();
    f.known.clear();
    await f.controller.open("/synthetic/one");
    expect(f.services.createSession).toHaveBeenCalledTimes(3);
  });
  it("does not show stale errors after cancellation and removes subscriptions", async () => {
    const f = fixture(); const pending = deferred<string>(); const listener = vi.fn();
    f.services.createSession.mockImplementation(() => pending.promise);
    const stop = f.controller.subscribe(listener);
    const run = f.controller.open("/synthetic/one");
    f.controller.cancel(); stop(); const count = listener.mock.calls.length;
    pending.reject(new Error("stale")); await run;
    expect(f.controller.getSnapshot().error).toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(count);
  });
});
