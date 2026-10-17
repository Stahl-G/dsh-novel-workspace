import { EditorView } from "@codemirror/view";
export declare function CodeEditor({ path, value, onChange, onSave, onAddToChat, label, readOnly, cursor, onCursor, onReady, }: {
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
}): import("react").JSX.Element;
