import type { Context } from "@deepseek-ai/cordis";
import type { ISessions } from "@deepseek-ai/dsh-api-session-controller/client";
import type { MainPanelId } from "@deepseek-ai/dsh-client-ui-layout/client";
import type {} from "@deepseek-ai/dsh-client-ui-workspace/client";
import type {} from "@deepseek-ai/dsh-client-ui-sidebar/client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createNovelEntryNavigation } from "./novel-entry-navigation.js";

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
    {state.error && <p role="alert">{state.error}</p>}
    {state.recent.length > 0 && <nav aria-label="最近打开的作品" style={{ display: "grid", gap: "8px", marginTop: "24px" }}>
      {state.recent.map((entry) => <button key={entry.path} type="button" disabled={state.busy} onClick={() => { void navigation.open(entry.path); }}>{entry.path.split(/[\\/]/u).filter(Boolean).at(-1) ?? entry.path}</button>)}
    </nav>}
  </section>;
}

export function registerNovelEntry(context: Context): void {
  context.plugin({
    inject: ["layout", "sessions", "uiWorkspace", "slots"],
    apply(ctx: Context) {
      // DSH declares a legacy SessionStore on Context; upstream uses the controller facade at this boundary.
      const sessions = ctx.sessions as unknown as ISessions;
      const navigation = createNovelEntryNavigation<SessionId>({
        beginNavigation: () => ctx.layout.beginNavigation(),
        pickDirectory: () => ctx.uiWorkspace.pickDirectory(),
        createSession: (cwd) => sessions.create({ cwd }),
        openSession: (id) => ctx.uiWorkspace.openSession(id),
        sessionExists: (id) => sessions.list.getSnapshot().byId[id] !== undefined
      });
      ctx.effect(() => () => navigation.cancel());
      ctx.slots.inject("main", () => ctx.slots.register({
        name: "main", key: NOVEL_ENTRY_PANEL, inject: () => ({ navigation })
      }, NovelEntry));
      ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
        name: "sidebar.panellist", id: NOVEL_ENTRY_PANEL, order: 25, label: () => "写作"
      }, () => <span aria-hidden>书</span>));
    }
  });
}
