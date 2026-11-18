import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-api-session-controller";
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { novelRecentRemote, requireRecentOwner, recentSessionId, type NovelRecentResponse } from "./novel-recent-contract.js";
import { readNovelRecent, touchNovelRecent, type RecentSessionRow } from "./novel-recent-store.js";

function profileDirectory(context: Context): string {
  const profile: unknown = Reflect.get(context, "profileContext");
  if (typeof profile !== "object" || profile === null || !("dir" in profile) || typeof profile.dir !== "string") throw new Error("当前宿主没有配置目录，最近作品未保存。");
  return profile.dir;
}
async function catalog(context: Context): Promise<readonly RecentSessionRow[]> {
  const registry: unknown = Reflect.get(context, "workspaceRegistry");
  if (typeof registry !== "object" || registry === null || !("archivedSessionIds" in registry) || !Array.isArray(registry.archivedSessionIds)
    || !registry.archivedSessionIds.every((id: unknown) => typeof id === "string")) throw new Error("当前作品列表尚未就绪。");
  const archived = new Set<string>(registry.archivedSessionIds);
  const signal = context.invocation?.signal ?? AbortSignal.abort();
  signal.throwIfAborted();
  const controller = context.get("sessionController");
  if (!controller) throw new Error("当前作品列表尚未就绪。");
  const value = await controller.list({}, signal);
  return value.items.map((item) => ({ id: item.sessionId, cwd: item.cwd, parentId: item.parentSessionId, origin: item.origin, formatStatus: item.formatStatus, archived: archived.has(item.sessionId) }));
}

/** Strict descriptors registered on DSH's authenticated Gateway, never a bare HTTP endpoint. */
export class NovelRecentService extends TypertRemoteService {
  static inject = ["sessionController", "typert"];
  constructor(context: Context) {
    super(context, "kaituNovelRecent");
    this.ctx.typert.register({
      package: novelRecentRemote.package,
      face: "host",
      schemas: [],
      model: { services: [], events: [], objects: [] },
      invocations: novelRecentRemote.descriptors
    });
  }
  async read(): Promise<NovelRecentResponse> {
    requireRecentOwner(this.ctx.invocation, []);
    return readNovelRecent(profileDirectory(this.ctx), () => catalog(this.ctx));
  }
  async touch(sessionId: string): Promise<NovelRecentResponse> {
    requireRecentOwner(this.ctx.invocation, ["sessionId"]);
    recentSessionId.parse(sessionId);
    return touchNovelRecent(profileDirectory(this.ctx), sessionId, () => catalog(this.ctx));
  }
}
export function registerNovelRecent(context: Context): void { context.plugin(NovelRecentService); }
