import { chooseEntry, recentEntries, type EntryCatalog, type RecentMemory } from "./novel-entry-catalog.js";

/** No manuscripts, transcripts or filesystem state are stored by the launcher. */
export interface NovelEntryServices<Id extends string> {
  beginNavigation(): AbortSignal;
  pickDirectory(): Promise<string | null>;
  validateDirectory(path: string, signal: AbortSignal): Promise<string>;
  refreshCatalog(): Promise<void>;
  catalog(): EntryCatalog<Id>;
  subscribeCatalog(listener: () => void): () => void;
  memory: RecentMemory;
  /** Shared native Sessions service identity, not the component instance. */
  owner: object;
  createSession(path: string): Promise<Id>;
  openSession(id: Id): void;
}
export interface NovelEntryState<Id extends string> {
  readonly busy: boolean;
  readonly warning?: string | undefined;
  readonly error: string | undefined;
  readonly recent: readonly { path: string; id: Id }[];
}
// A cancelled UI operation can still finish creating a native Session. Keep that
// single flight until settlement so remount/reselect cannot create a duplicate.
const creates = new WeakMap<object, Map<string, Promise<string>>>();
export function createNovelEntryNavigation<Id extends string>(services: NovelEntryServices<Id>) {
  let state: NovelEntryState<Id> = { busy: false, error: undefined, recent: [] };
  let generation = 0;
  let disposed = false;
  const listeners = new Set<() => void>();
  const update = (patch: Partial<NovelEntryState<Id>>) => {
    if (disposed) return;
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };
  const reconcile = () => {
    const catalog = services.catalog();
    if (catalog.ready) update({ warning: services.memory.warning?.(), recent: recentEntries(catalog, services.memory.read(), (id) => services.memory.expectedPath(id)) });
  };
  const unsubscribe = services.subscribeCatalog(reconcile);
  const refresh = async () => {
    await Promise.all([services.refreshCatalog(), services.memory.refresh?.()]);
    if (!services.catalog().ready) throw new Error("会话列表尚未加载，请稍后重试。未新建会话。");
    reconcile();
  };
  const cancel = () => { generation += 1; update({ busy: false, error: undefined }); };
  const open = async (providedPath?: string, expectedId?: Id): Promise<void> => {
    if (state.busy || disposed) return;
    const own = ++generation;
    const navigation = services.beginNavigation();
    const current = () => !disposed && generation === own && !navigation.aborted;
    update({ busy: true, error: undefined });
    try {
      const input = providedPath === undefined ? await services.pickDirectory() : providedPath.trim();
      if (!current() || input === null) return;
      if (!input) throw new Error("请填写作品目录。");
      const path = await services.validateDirectory(input, navigation);
      if (!current()) return;
      await refresh();
      if (!current()) return;
      if (expectedId !== undefined && !recentEntries(services.catalog(), services.memory.read(), (id) => services.memory.expectedPath(id)).some((entry) => entry.id === expectedId && entry.path === path)) throw new Error("该最近作品已失效，请重新选择目录。未新建会话。");
      let id = expectedId ?? chooseEntry(services.catalog(), path, services.memory.read());
      if (id === undefined) {
        // Never silently replace an existing but unsupported/migrating session.
        if (services.catalog().sessions.some((row) => row.cwd === path && !row.parentId && row.origin !== "subagent")) {
          throw new Error("该作品的会话暂时不能恢复，请先在 DSH 会话列表处理。未新建会话。");
        }
        let pending = creates.get(services.owner);
        if (!pending) { pending = new Map(); creates.set(services.owner, pending); }
        let attempt = pending.get(path);
        if (!attempt) {
          attempt = services.createSession(path);
          pending.set(path, attempt);
          const forget = () => { if (pending.get(path) === attempt) pending.delete(path); };
          void attempt.then(forget, forget);
        }
        id = await attempt as Id;
      }
      if (!current()) return;
      const row = services.catalog().sessions.find((entry) => entry.id === id);
      if (!row || row.cwd !== path || row.parentId || row.origin === "subagent" || row.archived) throw new Error("会话目录已变化，请重新选择作品。未打开其他会话。");
      await services.memory.write([id, ...services.memory.read().filter((value) => value !== id)], { id, path });
      if (!current()) return;
      services.openSession(id);
      reconcile();
    } catch (error) {
      if (current()) update({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      if (generation === own) update({ busy: false });
    }
  };
  reconcile();
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    open, cancel,
    restore: async () => { const own = generation; try { await refresh(); } catch (error) { if (generation === own && !state.busy) update({ error: error instanceof Error ? error.message : String(error) }); } },
    dispose: () => { cancel(); disposed = true; unsubscribe(); listeners.clear(); }
  };
}
