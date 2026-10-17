// Adapted from dsh-workbench-plugin code-editor-extensions.ts (MIT), f3d8c073.
// Copyright (c) 2026 DeepSeek. See THIRD_PARTY_LICENSES.md.
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { type Extension } from "@codemirror/state";
import { drawSelection, EditorView, keymap, type ViewUpdate } from "@codemirror/view";
export function workbenchEditorExtensions(opts: {
  path: string;
  label: string;
  onSave: () => void;
  onChange: (next: string) => void;
  onUpdate?: (update: ViewUpdate) => void;
}): Extension[] {
  return [
    drawSelection(),
    history(),
    markdown(),
    EditorView.lineWrapping,
    keymap.of([
      {
        key: "Mod-s",
        preventDefault: true,
        run: () => {
          opts.onSave();
          return true;
        },
      },
      ...defaultKeymap,
      ...historyKeymap,
    ]),
    EditorView.updateListener.of((update) => {
      opts.onUpdate?.(update);
      if (update.docChanged) opts.onChange(update.state.doc.toString());
    }),
    EditorView.contentAttributes.of({ "aria-label": opts.label }),
    EditorView.theme({
      "&": { height: "100%", color: "var(--ink)", background: "var(--surface)" },
      "&.cm-focused": { outline: "none" },
      ".cm-scroller": {
        overflow: "auto",
        fontFamily: 'Georgia, "Songti SC", "Noto Serif CJK SC", serif',
        fontSize: "18px",
        lineHeight: "1.95",
      },
      ".cm-content": { padding: "28px 30px 120px", minHeight: "100%" },
      ".cm-line": { padding: "0", maxWidth: "760px", margin: "auto" },
      ".cm-cursor": { borderLeftColor: "var(--ink)" },
      ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": { backgroundColor: "#b8d6ff" },
    }),
  ];
}
