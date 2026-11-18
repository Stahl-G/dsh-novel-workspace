import type { TypertRemoteContribution } from "@deepseek-ai/dsh-typert-protocol";
import type { NovelRecentResponse } from "../novel-recent-contract.js";
// TypertSchema's public strict-codec contract is parse(unknown). No Zod runtime.
const recentSessionId = { parse(value: unknown): string {
  if (typeof value !== "string" || !value.length || value.length > 256 || Array.from(value).some((c) => c.charCodeAt(0) < 32)) throw new Error("Invalid recent session identity");
  return value;
} };
export const recentResponse = { parse(value: unknown): NovelRecentResponse {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.keys(value).some((key) => key !== "entries") || !("entries" in value) || !Array.isArray(value.entries) || value.entries.length > 8) throw new Error("Invalid recent response");
  return { entries: value.entries.map((entry: unknown) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry) || Object.keys(entry).some((key) => key !== "id" && key !== "path") || !("id" in entry) || !("path" in entry) || typeof entry.path !== "string" || !entry.path.length || entry.path.length > 8192) throw new Error("Invalid recent pointer");
    return { id: recentSessionId.parse(entry.id), path: entry.path };
  }) };
} };
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
