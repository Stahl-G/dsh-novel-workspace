import type { NovelRecentResponse } from "../novel-recent-contract.js";
import { recentResponse } from "./novel-entry-contract.js";
import type { RecentMemory } from "./novel-entry-catalog.js";
async function bounded<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([operation, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Recent RPC timeout")), 5000); })]); }
  finally { if (timer !== undefined) clearTimeout(timer); }
}
export function hostRecentMemory(transport: { read(): Promise<NovelRecentResponse>; touch(id: string): Promise<NovelRecentResponse> }): RecentMemory {
  let entries: NovelRecentResponse["entries"] = [];
  let revision = 0;
  let warning: string | undefined;
  return {
    read: () => entries.map((entry) => entry.id),
    expectedPath: (id) => entries.find((entry) => entry.id === id)?.path,
    warning: () => warning,
    async refresh() {
      const own = ++revision;
      try { const response = recentResponse.parse(await bounded(transport.read())); if (own === revision) { entries = response.entries; warning = undefined; } }
      catch { if (own === revision) warning = "最近作品暂不可用；可手动打开同一目录继续。"; }
    },
    async write(ids, opened) {
      if (!opened) return;
      const own = ++revision;
      entries = [opened, ...entries.filter((entry) => entry.id !== opened.id && ids.includes(entry.id))].slice(0, 8);
      try { const response = recentResponse.parse(await bounded(transport.touch(opened.id))); if (own === revision) { entries = response.entries; warning = undefined; } }
      catch { if (own === revision) warning = "最近作品未能跨重启保存；仍可手动打开同一目录继续。"; }
    }
  };
}
/** Syntactic guard only. DSH creates/validates new directories; this never scans files. */
export function absoluteBookPath(input: string): string {
  const path = input.trim();
  const windows = /^[A-Za-z]:[\\/]/u.test(path) || path.startsWith("\\\\");
  const parts = windows ? path.split(/[\\/]/u) : path.split("/");
  const unc = path.startsWith("\\\\") && !/^\\\\[?.]\\/u.test(path) && parts.filter(Boolean).length >= 2;
  if ((!path.startsWith("/") && !/^[A-Za-z]:[\\/]/u.test(path) && !unc) || /^\\\\[?.]\\/u.test(path) || parts.some((part) => part === ".." || part === ".") || Array.from(path).some((character) => character.charCodeAt(0) < 32)) throw new Error("请提供不含 . 或 .. 的绝对作品目录。");
  if (/^[A-Za-z]:[\\/]$/u.test(path)) return path;
  return path.replace(windows ? /[\\/]+$/u : /\/+$/u, "") || "/";
}
