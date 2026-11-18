import { constants } from "node:fs";
import { lstat, open, realpath, rename, rm, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { isAbsolute, join } from "node:path";
import { z } from "zod";
import { recentSessionId, type NovelRecentResponse } from "./novel-recent-contract.js";

export const RECENT_FILENAME = ".kaitu-novel-recent-v1.json";
const stored = z.object({ version: z.literal(1), ids: z.array(recentSessionId).max(8) }).strict();
const queues = new Map<string, Promise<unknown>>();
export interface RecentSessionRow {
  readonly id: string;
  readonly cwd?: string | undefined;
  readonly parentId?: string | undefined;
  readonly origin?: string | undefined;
  readonly formatStatus?: string | undefined;
  readonly archived?: boolean | undefined;
}
function eligible(row: RecentSessionRow): row is RecentSessionRow & { cwd: string } {
  return recentSessionId.safeParse(row.id).success && typeof row.cwd === "string" && row.cwd.length <= 8192 && isAbsolute(row.cwd)
    && !row.parentId && row.origin !== "subagent" && !row.archived && (row.formatStatus === undefined || row.formatStatus === "current");
}

async function profileFile(profileDir: string): Promise<string> {
  if (typeof profileDir !== "string" || !isAbsolute(profileDir)) throw new Error("当前宿主未提供可用的配置目录，最近作品没有保存。");
  const directory = await realpath(profileDir);
  if (!(await stat(directory)).isDirectory()) throw new Error("当前配置目录不可用。");
  return join(directory, RECENT_FILENAME);
}
function code(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : undefined;
}
async function readIds(file: string): Promise<readonly string[]> {
  let info;
  try { info = await lstat(file); } catch (error) { if (code(error) === "ENOENT") return []; throw error; }
  if (!info.isFile() || info.isSymbolicLink() || info.size > 8192) throw new Error("最近作品记录不可读取，原记录未改动。");
  const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const current = await handle.stat();
    if (current.ino !== info.ino || current.dev !== info.dev || current.size > 8192) throw new Error("最近作品记录已改变，请重试。");
    const bytes = await handle.readFile();
    if (bytes.length > 8192) throw new Error("最近作品记录超过大小限制，原记录未改动。");
    return stored.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown).ids;
  } finally { await handle.close(); }
}
async function writeIds(file: string, ids: readonly string[]): Promise<void> {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    const handle = await open(temporary, "wx", 0o600);
    try { await handle.writeFile(`${JSON.stringify({ version: 1, ids })}\n`); await handle.sync(); }
    finally { await handle.close(); }
    await rename(temporary, file);
  } finally { await rm(temporary, { force: true }); }
}
async function entriesFor(ids: readonly string[], catalog: readonly RecentSessionRow[]): Promise<NovelRecentResponse["entries"]> {
  const entries: NovelRecentResponse["entries"] = [];
  const paths = new Set<string>();
  for (const id of ids) {
    const row = catalog.find((item) => item.id === id);
    if (!row || !eligible(row) || paths.has(row.cwd)) continue;
    try { if (!(await stat(row.cwd)).isDirectory()) continue; }
    catch (error) { if (code(error) === "ENOENT" || code(error) === "ENOTDIR") continue; throw error; }
    paths.add(row.cwd);
    entries.push({ id, path: row.cwd });
    if (entries.length === 8) break;
  }
  return entries;
}
async function serial<T>(file: string, operation: () => Promise<T>): Promise<T> {
  const previous = queues.get(file) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(operation);
  queues.set(file, next);
  try { return await next; }
  finally { if (queues.get(file) === next) queues.delete(file); }
}

/** Profile directory is supplied by the host only. Catalog errors must propagate. */
export async function readNovelRecent(profileDir: string, catalog: () => Promise<readonly RecentSessionRow[]>): Promise<NovelRecentResponse> {
  const file = await profileFile(profileDir);
  return serial(file, async () => ({ entries: await entriesFor(await readIds(file), await catalog()) }));
}
export async function touchNovelRecent(profileDir: string, sessionId: string, catalog: () => Promise<readonly RecentSessionRow[]>): Promise<NovelRecentResponse> {
  recentSessionId.parse(sessionId);
  const file = await profileFile(profileDir);
  return serial(file, async () => {
    const rows = await catalog();
    const selected = await entriesFor([sessionId], rows);
    if (selected.length !== 1) throw new Error("这个作品会话已不可用，请重新选择作品。");
    const previous = await readIds(file); // A damaged record never becomes an empty success.
    const entries = await entriesFor([...new Set([sessionId, ...previous])], rows);
    await writeIds(file, entries.map((entry) => entry.id));
    return { entries };
  });
}
