import { z } from "zod";
import type { RemoteResult, TypertRemoteContribution } from "@deepseek-ai/dsh-typert-protocol";

export const recentSessionId = z.string().min(1).max(256).refine((value) => Array.from(value).every((character) => character.charCodeAt(0) >= 32));
export const recentResponse = z.object({ entries: z.array(z.object({ id: recentSessionId, path: z.string().min(1).max(8192) }).strict()).max(8) }).strict();
export type NovelRecentResponse = z.infer<typeof recentResponse>;
export interface NovelRecentRemote {
  read(signal?: AbortSignal): Promise<RemoteResult<NovelRecentResponse>>;
  touch(sessionId: string, signal?: AbortSignal): Promise<RemoteResult<NovelRecentResponse>>;
}
declare module "@deepseek-ai/dsh-typert-protocol" {
  interface TypertRemoteNamespaceMap { kaituNovelRecent: NovelRecentRemote }
}

/** Fixed consumer-selected RPC surface; no arbitrary key, path or profile field. */
export const novelRecentRemote: TypertRemoteContribution = {
  package: "kaitu-novel-workspace",
  descriptors: ["read", "touch"].map((method) => ({
    id: `kaitu-novel-workspace#kaituNovelRecent/${method}`,
    service: "kaituNovelRecent",
    namespace: "kaituNovelRecent",
    method,
    invocation: { kind: "direct" as const },
    parameters: method === "touch" ? [{ name: "sessionId", wire: "sessionId", source: "json" as const, codec: { mode: "strict" as const, typeSymbol: "NovelRecentSessionId", create: () => recentSessionId } }] : [],
    result: { mode: "strict" as const, typeSymbol: "NovelRecentResponse", create: () => recentResponse }
  }))
};

export function requireRecentOwner(invocation: unknown, fields: readonly string[]): void {
  if (typeof invocation !== "object" || invocation === null || !("peer" in invocation) || !("request" in invocation)) throw new Error("最近作品需要已登录的宿主连接。");
  const peer = invocation.peer;
  if (typeof peer !== "object" || peer === null || !("principal" in peer)) throw new Error("最近作品需要已登录的宿主连接。");
  const principal = peer.principal;
  if (typeof principal !== "object" || principal === null || !("kind" in principal) || principal.kind !== "owner") throw new Error("只有宿主所有者可以读取或保存最近作品。");
  const request = invocation.request;
  if (typeof request !== "object" || request === null || !("args" in request) || typeof request.args !== "object" || request.args === null
    || Array.isArray(request.args) || Object.keys(request.args).some((key) => !fields.includes(key))) throw new Error("最近作品请求参数无效。");
}
