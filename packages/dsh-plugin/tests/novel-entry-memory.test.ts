import { expect, it } from "vitest";
import { absoluteBookPath, hostRecentMemory } from "../src/client/novel-entry-memory.js";
it("restores across client instances without browser storage and treats an empty host profile as authoritative", async () => {
  let entries: {id:string;path:string}[] = [];
  const transport = { read: () => Promise.resolve({entries}), touch: (id:string) => { entries = [{id,path:"/book"}]; return Promise.resolve({entries}); } };
  const first = hostRecentMemory(transport); await first.write(["s"],{id:"s",path:"/book"});
  const fresh = hostRecentMemory(transport); await fresh.refresh?.(); expect(fresh.read()).toEqual(["s"]);
  entries=[]; await fresh.refresh?.(); expect(fresh.read()).toEqual([]);
});
it("late reads cannot overwrite a new touch; failure preserves only this instance and warns", async () => {
  let release!: (v:{entries:[]})=>void;
  const memory=hostRecentMemory({read:()=>new Promise(r=>{release=r;}),touch:()=>Promise.reject(new Error("offline"))});
  const pending=memory.refresh?.(); await memory.write(["s"],{id:"s",path:"/book"}); release({entries:[]}); await pending;
  expect(memory.read()).toEqual(["s"]); expect(memory.warning?.()).toMatch(/未能/u);
});
it("rejects relative and parent traversal without using unavailable native browse capability", () => {
  for(const path of ["book","/book/../other","/book/./x"]) expect(()=>absoluteBookPath(path)).toThrow();
  expect(absoluteBookPath("/book/")).toBe("/book");
});
it("preserves Windows drive roots and UNC while rejecting relative and device paths", () => {
  expect(absoluteBookPath("C:\\")).toBe("C:\\");
  expect(absoluteBookPath("C:\\Books\\Novel\\")).toBe("C:\\Books\\Novel");
  expect(absoluteBookPath("\\\\server\\share\\book\\")).toBe("\\\\server\\share\\book");
  for(const path of ["C:book", "C:\\book\\..\\other", "\\\\?\\C:\\book", "\\\\.\\pipe\\x"]) expect(()=>absoluteBookPath(path)).toThrow();
});
