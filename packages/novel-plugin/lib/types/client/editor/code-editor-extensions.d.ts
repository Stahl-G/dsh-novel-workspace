import { type Extension } from "@codemirror/state";
import { type ViewUpdate } from "@codemirror/view";
export declare function workbenchEditorExtensions(opts: {
    path: string;
    label: string;
    onSave: () => void;
    onChange: (next: string) => void;
    onUpdate?: (update: ViewUpdate) => void;
}): Extension[];
