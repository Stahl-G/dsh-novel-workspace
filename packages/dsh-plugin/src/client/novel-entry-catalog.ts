/** Host Session identities are authoritative; browser memory is only an opt-in recent list. */
export interface EntrySession<Id extends string> {
  id: Id;
  cwd?: string | undefined;
  parentId?: string | undefined;
  origin?: string | undefined;
  formatStatus?: string | undefined;
  updatedAt: number;
  archived?: boolean | undefined;
}
export interface EntryCatalog<Id extends string> {
  ready: boolean;
  sessions: readonly EntrySession<Id>[];
}
export interface RecentMemory {
  read(): readonly string[];
  write(ids: readonly string[], opened?: { id: string; path: string }): void | Promise<void>;
  refresh?(): Promise<void>;
  warning?(): string | undefined;
  expectedPath(id: string): string | undefined;
}
export function browserRecentMemory(storage: Pick<Storage, "getItem" | "setItem"> | undefined, scope: string): RecentMemory {
  const key = `kaitu-novel:recent:v1:${scope}`;
  let fallback: readonly { id: string; path: string }[] = [];
  let volatile = false;
  const read = () => {
    if (volatile) return fallback;
    try {
      const raw = storage?.getItem(key);
      if (!raw) return fallback;
      const value: unknown = JSON.parse(raw);
      if (!Array.isArray(value) || !value.every((item: unknown) => typeof item === "object" && item !== null && "id" in item && "path" in item && typeof item.id === "string" && item.id.length > 0 && item.id.length < 256 && typeof item.path === "string" && item.path.length < 8192)) return fallback;
      return (value as { id: string; path: string }[]).slice(0, 8);
    } catch { return fallback; }
  };
  return {
    read: () => read().map((entry) => entry.id),
    expectedPath: (id) => read().find((entry) => entry.id === id)?.path,
    write(ids, opened) {
      const previous = read();
      fallback = [...new Set(ids)].slice(0, 8).map((id) => ({ id, path: opened?.id === id ? opened.path : previous.find((entry) => entry.id === id)?.path ?? "" }));
      try { storage?.setItem(key, JSON.stringify(fallback)); } catch { volatile = true; /* Private-mode/quota failure must not prevent native navigation. */ }
    }
  };
}
export function rootEntry<Id extends string>(row: EntrySession<Id>): row is EntrySession<Id> & { cwd: string } {
  return typeof row.cwd === "string" && row.cwd.length > 0 && !row.parentId && row.origin !== "subagent" && !row.archived && (row.formatStatus === undefined || row.formatStatus === "current");
}
export function recentEntries<Id extends string>(catalog: EntryCatalog<Id>, ids: readonly string[], expectedPath: (id: string) => string | undefined): { id: Id; path: string }[] {
  if (!catalog.ready) return [];
  const seen = new Set<string>();
  return ids.flatMap((id) => {
    const row = catalog.sessions.find((entry) => entry.id === id && rootEntry(entry));
    if (!row || !rootEntry(row) || expectedPath(id) !== row.cwd || seen.has(row.cwd)) return [];
    seen.add(row.cwd);
    return [{ id: row.id, path: row.cwd }];
  }).slice(0, 8);
}
export function chooseEntry<Id extends string>(catalog: EntryCatalog<Id>, path: string, preferred: readonly string[]): Id | undefined {
  const rows = catalog.sessions.filter((row) => rootEntry(row) && row.cwd === path);
  for (const id of preferred) {
    const row = rows.find((entry) => entry.id === id);
    if (row) return row.id;
  }
  // Explicitly selecting an old alpha.1 directory may have no recent marker.
  // Pick its newest eligible root, never another book or a similarly named path.
  return rows.toSorted((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id))[0]?.id;
}
