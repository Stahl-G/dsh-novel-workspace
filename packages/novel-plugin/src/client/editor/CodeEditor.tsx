// Adapted from dsh-workbench-plugin CodeEditor.tsx (MIT), f3d8c073.
// Copyright (c) 2026 DeepSeek. See THIRD_PARTY_LICENSES.md.
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { useCallback, useEffect, useRef, useState } from "react";
import { workbenchEditorExtensions } from "./code-editor-extensions.js";
import css from "../Writer.module.css";

interface SelSnapshot {
  text: string;
  left: number;
  top: number;
}

export function CodeEditor({
  path,
  value,
  onChange,
  onSave,
  onAddToChat,
  label,
  readOnly,
  cursor,
  onCursor,
  onReady,
}: {
  path: string;
  value: string;
  onChange: (next: string) => void;
  onSave: () => void;
  onAddToChat?: (text: string, kind: "selection" | "file") => boolean;
  label: string;
  readOnly: boolean;
  cursor: number;
  onCursor: (position: number) => void;
  onReady?: (view: EditorView | null) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const modeCompartmentRef = useRef<Compartment | null>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const onAddToChatRef = useRef(onAddToChat);
  const onCursorRef = useRef(onCursor);
  onCursorRef.current = onCursor;
  const applyingRef = useRef(false);
  const selRef = useRef<SelSnapshot | null>(null);
  const [sel, setSel] = useState<SelSnapshot | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  onChangeRef.current = onChange;
  onSaveRef.current = onSave;
  onAddToChatRef.current = onAddToChat;

  const syncSelection = useCallback((state: EditorState): void => {
    const view = viewRef.current;
    const host = hostRef.current;
    if (view === null || host === null) return;
    const main = state.selection.main;
    if (main.empty) {
      selRef.current = null;
      setSel(null);
      return;
    }
    const text = state.sliceDoc(main.from, main.to);
    if (text === "") {
      selRef.current = null;
      setSel(null);
      return;
    }
    const coords = view.coordsAtPos(main.head, 1) ?? view.coordsAtPos(main.from);
    if (coords === null) {
      selRef.current = null;
      setSel(null);
      return;
    }
    const hostRect = host.getBoundingClientRect();
    const next: SelSnapshot = {
      text,
      left: Math.round(coords.left - hostRect.left),
      top: Math.round(coords.bottom - hostRect.top + 8),
    };
    selRef.current = next;
    setSel(next);
  }, []);

  useEffect(() => {
    const parent = hostRef.current;
    if (parent === null) return;
    const modeCompartment = new Compartment();
    modeCompartmentRef.current = modeCompartment;
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: value,
        selection: { anchor: Math.min(cursor, value.length) },
        extensions: [
          ...workbenchEditorExtensions({
            path,
            label,
            onSave: () => {
              onSaveRef.current();
            },
            onChange: (next) => {
              if (!applyingRef.current) onChangeRef.current(next);
            },
            onUpdate: (update) => {
              onCursorRef.current(update.state.selection.main.head);
              if (applyingRef.current) return;
              if (update.selectionSet || update.docChanged || update.geometryChanged)
                syncSelection(update.state);
            },
          }),
          modeCompartment.of([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]),
        ],
      }),
    });
    viewRef.current = view;
    onReady?.(view);
    view.dispatch({ effects: EditorView.scrollIntoView(view.state.selection.main.head) });
    const onScroll = (): void => syncSelection(view.state);
    view.scrollDOM.addEventListener("scroll", onScroll);
    view.focus();
    return () => {
      view.scrollDOM.removeEventListener("scroll", onScroll);
      view.destroy();
      viewRef.current = null;
      onReady?.(null);
      modeCompartmentRef.current = null;
    };
  }, [path, label, syncSelection]);

  useEffect(() => {
    const view = viewRef.current;
    const compartment = modeCompartmentRef.current;
    if (view === null || compartment === null) return;
    view.dispatch({
      effects: compartment.reconfigure([
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
      ]),
    });
  }, [readOnly]);

  useEffect(() => {
    const view = viewRef.current;
    if (view === null) return;
    if (view.state.doc.toString() === value) return;
    applyingRef.current = true;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    });
    applyingRef.current = false;
  }, [value]);

  useEffect(
    () => () => {
      if (flashTimer.current !== null) clearTimeout(flashTimer.current);
    },
    [],
  );

  const flashMsg = (labelText: string): void => {
    setFlash(labelText);
    if (flashTimer.current !== null) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => {
      setFlash(null);
    }, 1600);
  };

  const addSelectionToChat = (): void => {
    const snapshot = selRef.current;
    if (snapshot === null) return;
    const ok = onAddToChatRef.current?.(snapshot.text, "selection") === true;
    if (ok) flashMsg("已带入写作助手");
    const view = viewRef.current;
    if (view !== null) {
      view.dispatch({ selection: { anchor: view.state.selection.main.head } });
    }
    selRef.current = null;
    setSel(null);
  };

  return (
    <div className={css.editorWrap}>
      <div ref={hostRef} className={css.cmHost} data-path={path} />
      {sel !== null && onAddToChat !== undefined ? (
        <button
          type="button"
          className={css.selChatBtn}
          style={{ left: sel.left, top: sel.top }}
          title={"讨论选中文字"}
          onMouseDown={(event) => {
            event.preventDefault();
          }}
          onClick={addSelectionToChat}
        >
          <span>讨论这段</span>
        </button>
      ) : null}
      {flash !== null ? (
        <div className={css.copyFlash} role="status">
          {flash}
        </div>
      ) : null}
    </div>
  );
}
