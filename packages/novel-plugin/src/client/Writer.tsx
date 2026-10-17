import type { EditorView } from "@codemirror/view";
import type { Anchor, NovelData, NovelView } from "@kaitu/core";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import css from "./Writer.module.css";
import { CodeEditor } from "./editor/CodeEditor.js";
import type { Request } from "./page.js";
export type WriterSource = { scene: NovelData["scenes"][number]; text: string; path: string; anchor: Anchor };
type ReferenceSource = { path: string; relativePath: string; text: string; fileHash: string; scene: string };
export type WriterAgent = {
  send(project: string, text: string): Promise<void>;
  render(project: string, onReply: () => void): ReactNode;
};
export function Writer({
  project,
  title,
  request,
  agent,
  onView,
  onBack,
}: {
  project: string;
  title: string;
  request: Request;
  agent?: WriterAgent;
  onView(view: NovelView): void;
  onBack(): void;
}) {
  const [view, setView] = useState<NovelView>();
  const [source, setSource] = useState<WriterSource>();
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [intent, setIntent] = useState("");
  const [selected, setSelected] = useState("");
  const [action, setAction] = useState("check");
  const [cursor, setCursor] = useState(0);
  const [epoch, setEpoch] = useState(0);
  const [reference, setReference] = useState<ReferenceSource | null>(null);
  const [referenceText, setReferenceText] = useState("");
  const referenceLatest = useRef({ reference, text: referenceText });
  referenceLatest.current = { reference, text: referenceText };
  const [referenceId, setReferenceId] = useState("");
  const [assistantOpen, setAssistantOpen] = useState(true);
  const editor = useRef<EditorView | null>(null);
  const latest = useRef({ source, text });
  latest.current = { source, text };
  const key = `kaitu-writer:${project}`;
  const dirty = !!source && text !== source.text;
  const referenceDirty = !!reference && referenceText !== reference.text;
  const writing = view?.data.writingMode === "writing";
  const editable = writing && !!source && /\.(md|txt)$/i.test(source.path);
  const update = useCallback(
    (v: NovelView) => {
      setView(v);
      onView(v);
    },
    [onView],
  );
  async function refresh() {
    const v = await request<NovelView>("view", { project });
    update(v);
    return v;
  }
  const load = useCallback(
    async (id: string) => {
      const s = await request<WriterSource>("scene", { project, scene: id });
      setSource(s);
      const recovery = sessionStorage.getItem(`${key}:draft:${s.scene.id}`);
      const draft = recovery ? (JSON.parse(recovery) as { text: string; fileHash: string }) : null;
      setText(draft?.text ?? s.text);
      if (draft && draft.fileHash !== s.anchor.fileHash) {
        setSource({ ...s, anchor: { ...s.anchor, fileHash: draft.fileHash } });
        setError("原文件已有修改，已保留你上次未保存的编辑，可导出对照");
      }
      setSelected("");
      setEpoch((n) => n + 1);
      const position = Number(localStorage.getItem(`${key}:${s.scene.id}`) ?? 0);
      setCursor(Math.min(position, s.text.length));
      localStorage.setItem(key, s.scene.id);
    },
    [key, project, request],
  );
  useEffect(() => {
    let live = true;
    void request<NovelView>("view", { project })
      .then(async (v) => {
        if (!live) return;
        update(v);
        const scenes = v.data.scenes.filter(
          (s) =>
            !v.data.documents.find((d) => d.id === s.documentId)?.classification ||
            v.data.documents.find((d) => d.id === s.documentId)?.classification?.role === "manuscript",
        );
        const remembered = localStorage.getItem(key);
        const id = scenes.find((s) => s.id === remembered)?.id ?? scenes[0]?.id;
        if (id) await load(id);
        const rememberedReference = localStorage.getItem(`${key}:reference`);
        const refScene = v.data.scenes.find((s) => s.documentId === rememberedReference);
        if (refScene) {
          const ref = await request<ReferenceSource>("document", { project, scene: refScene.id });
          const stored = sessionStorage.getItem(`${key}:reference-draft:${ref.path}`);
          const draft = stored ? (JSON.parse(stored) as { text: string; fileHash: string }) : null;
          setReference(draft ? { ...ref, fileHash: draft.fileHash } : ref);
          setReferenceText(draft?.text ?? ref.text);
          setReferenceId(refScene.documentId);
          setAssistantOpen(false);
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [project, key, request, load, update]);
  useEffect(() => {
    if (!source) return;
    const cache = `${key}:draft:${source.scene.id}`;
    if (dirty) sessionStorage.setItem(cache, JSON.stringify({ text, fileHash: source.anchor.fileHash }));
    else sessionStorage.removeItem(cache);
  }, [source, text, dirty, key]);
  useEffect(() => {
    const prevent = (e: BeforeUnloadEvent) => {
      if (
        (latest.current.source && latest.current.text !== latest.current.source.text) ||
        (referenceLatest.current.reference &&
          referenceLatest.current.text !== referenceLatest.current.reference.text)
      ) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, []);
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    const current = latest.current;
    if (!current.source || current.text === current.source.text) return current.source;
    const fresh = await refresh();
    const result = await request<{ scene: string }>("saveScene", {
      project,
      revision: fresh.revision,
      input: { scene: current.source.scene.id, fileHash: current.source.anchor.fileHash, text: current.text },
    });
    const saved = await request<WriterSource>("scene", { project, scene: result.scene });
    setSource(saved);
    // Keep typing that happened while the save was in flight.
    setText((t) => (t === current.text ? saved.text : t));
    await refresh();
    setNotice("已保存");
    return saved;
  }
  async function switchScene(id: string) {
    await save();
    await load(id);
    setNotice("");
  }
  function restoreReference(ref: ReferenceSource) {
    const stored = sessionStorage.getItem(`${key}:reference-draft:${ref.path}`);
    const draft = stored ? (JSON.parse(stored) as { text: string; fileHash: string }) : null;
    setReference(draft ? { ...ref, fileHash: draft.fileHash } : ref);
    setReferenceText(draft?.text ?? ref.text);
  }
  useEffect(() => {
    if (!reference) return;
    const cache = `${key}:reference-draft:${reference.path}`;
    if (referenceDirty)
      sessionStorage.setItem(cache, JSON.stringify({ text: referenceText, fileHash: reference.fileHash }));
    else sessionStorage.removeItem(cache);
  }, [reference, referenceText, referenceDirty, key]);
  async function saveReference() {
    const current = referenceLatest.current;
    if (!current.reference || current.text === current.reference.text) return;
    const fresh = await refresh();
    const result = await request<{ scene: string }>("saveScene", {
      project,
      revision: fresh.revision,
      input: {
        scene: current.reference.scene,
        fileHash: current.reference.fileHash,
        text: current.text,
        wholeDocument: true,
      },
    });
    const saved = await request<ReferenceSource>("document", { project, scene: result.scene });
    setReference(saved);
    setReferenceText((t) => (t === current.text ? saved.text : t));
    await refresh();
  }
  async function closeReference() {
    await saveReference();
    setReference(null);
    localStorage.removeItem(`${key}:reference`);
  }
  async function openReference(documentId: string) {
    await saveReference();
    const scene = view?.data.scenes.find((s) => s.documentId === documentId);
    if (!scene) return;
    const doc = await request<ReferenceSource>("document", { project, scene: scene.id });
    restoreReference(doc);
    setReferenceId(documentId);
    localStorage.setItem(`${key}:reference`, documentId);
    setAssistantOpen(false);
  }
  async function send(kind = action) {
    setAssistantOpen(true);
    if (!agent || !source) return;
    await saveReference();
    const saved = await save();
    if (!saved) return;
    const task =
      kind === "check"
        ? "检查当前章节与已有设定、人物位置、年龄、事件时间和科学细节是否冲突。逐项引用正文原句与资料文件/标题，区分明确冲突、条件不足和可选建议。客观常识自行查证；尊重虚构例外，人物谎言或比喻不当作世界事实。只报告有依据的问题。"
        : kind === "plot"
          ? "结合现有伏笔和人物动机，提出 2–3 个下一步剧情方向：具体人物动作、阻力、科学或环境细节、后果及可回收的伏笔。先给可讨论的短方案。"
          : "从下面标记的光标位置续写，先读相关原稿样本和世界书，保持视角、语感、对白和细节取舍；不要重复已有正文。用 kaitu_novel_draft 保存独立候选，scene 使用下方章节定位，styleSources 写已读场景。直接返回简短说明，正文留在候选中。";
    const position = editor.current?.state.selection.main.head ?? cursor;
    const context = `${saved.text.slice(Math.max(0, position - 10000), position)}\n【作者光标】\n${saved.text.slice(position, position + 3000)}`;
    await agent.send(
      project,
      `作品：${title}；项目：${project}\n作品目录：${view?.data.sourceRoot}\n当前文件：${saved.path}\n章节定位：${saved.path}#${saved.scene.title}\n${task}\n先用 DSH 文件工具寻找并阅读相关世界书、设定集、大纲；引用已存在的资料，不要求作者重填。当前模式：${writing ? "写作" : "只读"}。本次操作仅讨论、校对或保存候选，不修改任何原稿。\n作者补充：${intent || "无"}\n${selected ? `选中段落：\n${selected}\n` : ""}光标附近正文（全文及上下文请按文件读取）：\n${context}`,
    );
    setNotice("已发送给写作助手");
  }
  const scenes =
    view?.data.scenes.filter((s) => {
      const role = view.data.documents.find((d) => d.id === s.documentId)?.classification?.role;
      return !role || role === "manuscript";
    }) ?? [];
  const documents =
    view?.data.documents.filter((d) => d.classification && d.classification.role !== "manuscript") ?? [];
  const drafts = view?.data.drafts?.filter((d) => d.scene === source?.scene.id && !d.applied) ?? [];
  return (
    <div className={css.shell}>
      <header className={css.header}>
        <div>
          <h1>{title}</h1>
          <small>{dirty ? "未保存" : notice || "正文工作台"}</small>
        </div>
        <button
          type="button"
          disabled={busy || !documents.length}
          onClick={() => {
            if (reference) {
              void run(closeReference);
            } else {
              const doc = documents.find((d) => d.classification?.role === "outline") ?? documents[0];
              if (doc) void run(() => openReference(doc.id));
            }
          }}
        >
          {reference ? "收起对照" : "对照资料"}
        </button>
        <button type="button" onClick={() => setAssistantOpen((v) => !v)}>
          {assistantOpen ? "收起助手" : "写作助手"}
        </button>
        <select
          aria-label="作品模式"
          value={writing ? "writing" : "read_only"}
          disabled={busy}
          onChange={(e) => {
            const mode = e.target.value;
            void run(async () => {
              await saveReference();
              await save();
              const v = await refresh();
              await request("edit", { project, revision: v.revision, command: { type: "mode", mode } });
              await refresh();
            });
          }}
        >
          <option value="read_only">只读</option>
          <option value="writing">写作</option>
        </select>
        <button
          type="button"
          onClick={() =>
            void run(async () => {
              await saveReference();
              await save();
              onBack();
            })
          }
        >
          作品与资料
        </button>
      </header>
      {error && (
        <div role="alert" className={css.error}>
          {error}{" "}
          <button
            type="button"
            onClick={() => {
              const a = document.createElement("a");
              const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
              a.href = url;
              a.download = "未保存的章节.md";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            导出当前编辑
          </button>
        </div>
      )}
      <div
        className={`${css.columns} ${reference ? css.withReference : ""} ${!assistantOpen ? css.noAssistant : ""}`}
      >
        <nav className={css.chapters}>
          <h2>章节</h2>
          {scenes.map((s) => (
            <button
              type="button"
              key={s.id}
              disabled={busy}
              aria-current={s.id === source?.scene.id ? "page" : undefined}
              onClick={() => void run(() => switchScene(s.id))}
            >
              {s.title}
              <small>{s.path.split("/").at(-1)}</small>
            </button>
          ))}
          <h2>资料</h2>
          {documents.map((d) => (
            <button
              type="button"
              key={d.id}
              disabled={busy}
              onClick={() => {
                void run(() => openReference(d.id));
              }}
            >
              {d.path.split("/").at(-1)}
              <small>{d.classification?.role === "setting" ? "世界书 / 设定" : "大纲 / 参考资料"}</small>
            </button>
          ))}
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await save();
                const v = await refresh();
                await request("edit", { project, revision: v.revision, command: { type: "refresh" } });
                const fresh = await refresh();
                const s =
                  fresh.data.scenes.find((s) => s.id === source?.scene.id) ??
                  fresh.data.scenes.find((s) => s.path === source?.scene.path) ??
                  fresh.data.scenes.find((s) => {
                    const role = fresh.data.documents.find((d) => d.id === s.documentId)?.classification
                      ?.role;
                    return !role || role === "manuscript";
                  });
                if (s) await load(s.id);
                else {
                  setSource(undefined);
                  setText("");
                }
              })
            }
          >
            刷新文件
          </button>
        </nav>
        {reference && (
          <section className={css.reference} aria-label="对照资料">
            <div className={css.toolbar}>
              <select
                aria-label="对照文件"
                value={referenceId}
                disabled={busy}
                onChange={(e) => void run(() => openReference(e.target.value))}
              >
                {documents.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.path.split("/").at(-1)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  void run(closeReference);
                }}
                aria-label="关闭对照资料"
              >
                关闭
              </button>
            </div>
            <div className={css.referenceActions}>
              <span>{referenceDirty ? "资料未保存" : "资料已保存"}</span>
              <button
                type="button"
                disabled={!writing || !referenceDirty || busy}
                onClick={() => void run(saveReference)}
              >
                保存资料 ⌘S
              </button>
              <button
                type="button"
                disabled={
                  !writing || busy || referenceDirty || view?.data.editorUndo?.path !== reference.relativePath
                }
                onClick={() =>
                  void run(async () => {
                    const fresh = await refresh();
                    await request("undoScene", { project, revision: fresh.revision });
                    const updated = await refresh();
                    const scene = updated.data.scenes.find((s) => s.path === reference.relativePath);
                    if (scene)
                      restoreReference(
                        await request<ReferenceSource>("document", { project, scene: scene.id }),
                      );
                  })
                }
              >
                撤销资料保存
              </button>
            </div>
            <CodeEditor
              key={reference.path}
              path={reference.path}
              label="对照资料内容"
              value={referenceText}
              onChange={setReferenceText}
              onSave={() => {
                if (writing && !busy) void run(saveReference);
              }}
              readOnly={!writing || busy || !/\.(md|txt)$/i.test(reference.path)}
              cursor={0}
              onCursor={() => {}}
            />
          </section>
        )}
        <section className={css.manuscript}>
          <div className={css.toolbar}>
            <strong>{source?.scene.title ?? "选择章节"}</strong>
            <button type="button" disabled={!editable || !dirty || busy} onClick={() => void run(save)}>
              保存 ⌘S
            </button>
            <button
              type="button"
              disabled={
                !writing ||
                !view?.data.editorUndo ||
                view.data.editorUndo.path !== source?.scene.path ||
                dirty ||
                busy
              }
              onClick={() =>
                void run(async () => {
                  const v = await refresh();
                  const r = await request<{ path: string }>("undoScene", { project, revision: v.revision });
                  const fresh = await refresh();
                  const s =
                    fresh.data.scenes.find((s) => s.id === source?.scene.id) ??
                    fresh.data.scenes.find((s) => s.path === r.path);
                  if (s) await load(s.id);
                  setNotice("已撤销上次保存");
                })
              }
            >
              撤销保存
            </button>
          </div>
          {source && (
            <CodeEditor
              key={`${source.scene.id}:${epoch}`}
              path={source.path}
              label="小说正文"
              value={text}
              onChange={setText}
              onSave={() => {
                if (editable && !busy) void run(save);
              }}
              readOnly={!editable || busy}
              cursor={cursor}
              onCursor={(p) => {
                setCursor(p);
                localStorage.setItem(`${key}:${source.scene.id}`, String(p));
              }}
              onReady={(v) => {
                editor.current = v;
              }}
              onAddToChat={(value) => {
                setSelected(value);
                setIntent("请分析这段");
                return true;
              }}
            />
          )}
          {source && !/\.(md|txt)$/i.test(source.path) && (
            <p className={css.hint}>
              DOCX 阅读视图 ·{" "}
              <button
                type="button"
                onClick={() => void run(() => request("open", { project, scene: source.scene.id }))}
              >
                在原编辑器修改
              </button>
            </p>
          )}
          <footer>
            <span>{Array.from(text.replace(/\s/g, "")).length} 字符 · 已记住光标位置</span>
            <button
              type="button"
              disabled={!editable || busy}
              onClick={() => {
                setAction("continue");
                void run(() => send("continue"));
              }}
            >
              从这里续写
            </button>
          </footer>
        </section>
        {assistantOpen && (
          <aside className={css.assistant}>
            <h2>写作助手</h2>
            <div className={css.tabs}>
              {[
                ["check", "查设定"],
                ["plot", "想剧情"],
                ["continue", "接着写"],
              ].map(([id, label]) => (
                <button
                  type="button"
                  key={id}
                  aria-selected={action === id}
                  onClick={() => setAction(id ?? "check")}
                >
                  {label}
                </button>
              ))}
            </div>
            <small>当前章节 + Agent 自动查找的世界书与资料</small>
            <textarea
              aria-label="给写作助手的要求"
              placeholder="补充你的要求，或选中正文讨论……"
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
            />
            {selected && (
              <details>
                <summary>
                  已选中 {selected.length} 字{" "}
                  <button type="button" onClick={() => setSelected("")}>
                    清除
                  </button>
                </summary>
                <blockquote>{selected}</blockquote>
              </details>
            )}
            <button
              type="button"
              className={css.primary}
              disabled={!source || !agent || busy || (action === "continue" && !writing)}
              onClick={() => void run(() => send())}
            >
              {action === "check" ? "检查当前章节" : action === "plot" ? "推荐接下来的剧情" : "生成续写候选"}
            </button>
            {!agent && <small>在 DSH 中打开可使用写作助手。</small>}
            <div className={css.chat}>
              {agent?.render(project, () => {
                void refresh().catch((e) => setError(e.message));
              })}
            </div>
            <details className={css.candidates} open>
              <summary>
                续写候选{" "}
                <button type="button" disabled={busy} onClick={() => void run(refresh)}>
                  刷新
                </button>
              </summary>
              {drafts.map((d) => (
                <article key={d.id}>
                  <strong>{d.title}</strong>
                  <pre>{d.text}</pre>
                  <button
                    type="button"
                    disabled={!editable || busy}
                    onClick={() =>
                      void run(async () => {
                        if (d.sourceHash !== source?.anchor.fileHash)
                          throw new Error("这份候选基于旧稿，请让 Agent 对照当前章节更新");
                        const cm = editor.current;
                        if (cm) {
                          const at = cm.state.selection.main.head;
                          cm.dispatch({
                            changes: { from: at, insert: `\n\n${d.text}\n` },
                            selection: { anchor: at + d.text.length + 3 },
                          });
                          cm.focus();
                          setNotice("候选已插入，保存后写入原稿；⌘Z 可撤销");
                        }
                      })
                    }
                  >
                    采纳到光标位置
                  </button>
                </article>
              ))}
              {!drafts.length && <small>续写完成后会显示在这里。</small>}
            </details>
          </aside>
        )}
      </div>
    </div>
  );
}
