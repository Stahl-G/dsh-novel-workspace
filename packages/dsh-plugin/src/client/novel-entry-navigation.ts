/** The entry only selects native DSH sessions; it owns no manuscripts or chat state. */
export interface NovelEntryServices<Id extends string> {
  beginNavigation(): AbortSignal;
  pickDirectory(): Promise<string | null>;
  createSession(path: string): Promise<Id>;
  openSession(id: Id): void;
  sessionExists(id: Id): boolean;
}
export interface NovelEntryState<Id extends string> {
  readonly busy: boolean;
  readonly error: string | undefined;
  readonly recent: readonly { path: string; id: Id }[];
}
export function createNovelEntryNavigation<Id extends string>(services: NovelEntryServices<Id>) {
  let state: NovelEntryState<Id> = { busy: false, error: undefined, recent: [] };
  let generation = 0;
  const listeners = new Set<() => void>();
  const update = (patch: Partial<NovelEntryState<Id>>) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };
  const cancel = () => { generation += 1; update({ busy: false, error: undefined }); };
  const open = async (providedPath?: string): Promise<void> => {
    // Repeated activation joins the in-flight operation rather than creating two sessions.
    if (state.busy) return;
    const own = ++generation;
    const navigation = services.beginNavigation();
    const current = () => generation === own && !navigation.aborted;
    update({ busy: true, error: undefined });
    try {
      const path = providedPath === undefined ? await services.pickDirectory() : providedPath.trim();
      if (!current() || path === null) return;
      if (!path) throw new Error("请填写作品目录。");
      const previous = state.recent.find((entry) => entry.path === path && services.sessionExists(entry.id));
      const id = previous?.id ?? await services.createSession(path);
      if (!current()) return;
      services.openSession(id);
      update({ recent: [{ path, id }, ...state.recent.filter((entry) => entry.path !== path)].slice(0, 8) });
    } catch (error) {
      if (current()) update({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      if (generation === own) update({ busy: false });
    }
  };
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    open,
    cancel
  };
}
