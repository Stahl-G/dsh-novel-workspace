import type { Context } from "@deepseek-ai/cordis";
import type { ISessions } from "@deepseek-ai/dsh-api-session-controller/client";
import type { MainPanelId } from "@deepseek-ai/dsh-client-ui-layout/client";
import type {} from "@deepseek-ai/dsh-client-ui-workspace/client";
import type {} from "@deepseek-ai/dsh-client-ui-sidebar/client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createNovelEntryNavigation } from "./novel-entry-navigation.js";
import { absoluteBookPath, hostRecentMemory } from "./novel-entry-memory.js";
import { novelRecentRemote } from "./novel-entry-contract.js";
import type { NovelRecentRemote } from "../novel-recent-contract.js";

export const NOVEL_ENTRY_PANEL = "kaitu-novel" as MainPanelId;
type SessionId = Awaited<ReturnType<ISessions["create"]>>;
type Navigation = ReturnType<typeof createNovelEntryNavigation<SessionId>>;

/** Only a directory/session launcher. The upstream overlay remains the sole workbench. */
export function NovelEntry({ navigation }: { navigation: Navigation }) {
  const state = useSyncExternalStore(navigation.subscribe, navigation.getSnapshot, navigation.getSnapshot);
  const [path, setPath] = useState("");
  useEffect(() => () => navigation.cancel(), [navigation]);
  return <section data-kaitu-novel-entry aria-label="写作" style={{ padding: "32px", maxWidth: "840px", margin: "0 auto" }}>
    <h1>写作</h1>
    <button type="button" disabled={state.busy} onClick={() => { void navigation.open(); }}>打开作品目录</button>
    <form style={{ display: "flex", gap: "8px", marginTop: "16px" }} onSubmit={(event) => { event.preventDefault(); void navigation.open(path); }}>
      <input aria-label="作品目录路径" placeholder="或粘贴作品目录路径" value={path} onChange={(event) => setPath(event.target.value)} style={{ flex: 1, minWidth: 0 }} />
      <button type="submit" disabled={state.busy || !path.trim()}>打开</button>
      {state.busy && <button type="button" onClick={navigation.cancel}>取消</button>}
    </form>
    {state.warning && <p role="status">{state.warning}</p>}
    {state.error && <p role="alert">{state.error}</p>}
    {state.recent.length > 0 && <nav aria-label="最近打开的作品" style={{ display: "grid", gap: "8px", marginTop: "24px" }}>
      {state.recent.map((entry) => <button key={entry.path} title={entry.path} type="button" disabled={state.busy} onClick={() => { void navigation.open(entry.path, entry.id); }}>{entry.path.split(/[\\/]/u).filter(Boolean).at(-1) ?? entry.path}</button>)}
    </nav>}
  </section>;
}

export function registerNovelEntry(context: Context): void {
  context.plugin({
    inject: ["layout", "sessions", "workspaces", "uiWorkspace", "slots", "remote", "typert"],
    apply(ctx: Context) {
      // DSH declares a legacy SessionStore on Context; upstream uses the controller facade at this boundary.
      const sessions = ctx.sessions as unknown as ISessions;
      // Same public workspace catalog consumed by native uiWorkspace. The
      // plugin does not mutate workspace memberships or archived identities.
      const workspaces = ctx.get("workspaces") as {
        list: { getSnapshot(): { phase: string; archivedSessionIds: readonly string[] }; subscribe(listener: () => void): () => void };
      };
      // Mount and consume in different Cordis scopes: the consumer cannot wait
      // for the namespace service that its own apply would have to create.
      const mounted = new Promise<NovelRecentRemote>((resolve, reject) => {
        ctx.plugin({
          inject: ["remote", "remote.kaituNovelRecent"],
          apply(consumer: Context) { resolve(consumer.remote.kaituNovelRecent); }
        });
        void ctx.remote.$mount(novelRecentRemote).catch(reject);
      });
      const memory = hostRecentMemory({
        read: async () => { const remote = await mounted; const result = await remote.read(); if (!result.ok) throw new Error("Recent read unavailable"); return result.value; },
        touch: async (id) => { const remote = await mounted; const result = await remote.touch(id); if (!result.ok) throw new Error("Recent save unavailable"); return result.value; }
      });
      const navigation = createNovelEntryNavigation<SessionId>({
        owner: sessions,
        memory,
        refreshCatalog: () => sessions.refresh(),
        catalog: () => {
          const snapshot = sessions.list.getSnapshot();
          const workspace = workspaces.list.getSnapshot();
          return { ready: snapshot.phase === "ready" && workspace.phase === "ready", sessions: snapshot.ids.flatMap((id) => {
            const row = snapshot.byId[id];
            return row ? [{ ...row, archived: workspace.archivedSessionIds.includes(id) }] : [];
          }) };
        },
        subscribeCatalog: (listener) => {
          const stopSessions = sessions.list.subscribe(listener);
          const stopWorkspaces = workspaces.list.subscribe(listener);
          return () => { stopSessions(); stopWorkspaces(); };
        },
        validateDirectory: (path) => Promise.resolve(absoluteBookPath(path)),
        beginNavigation: () => ctx.layout.beginNavigation(),
        pickDirectory: () => ctx.uiWorkspace.pickDirectory(),
        createSession: (cwd) => sessions.create({ cwd }),
        openSession: (id) => ctx.uiWorkspace.openSession(id)
      });
      void navigation.restore();
      ctx.effect(() => () => navigation.dispose());
      ctx.slots.inject("main", () => ctx.slots.register({
        name: "main", key: NOVEL_ENTRY_PANEL, inject: () => ({ navigation })
      }, NovelEntry));
      ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
        name: "sidebar.panellist", id: NOVEL_ENTRY_PANEL, order: 25, label: () => "写作"
      }, () => <span aria-hidden>书</span>));
    }
  });
}
