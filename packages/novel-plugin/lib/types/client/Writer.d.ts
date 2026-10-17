import type { Anchor, NovelData, NovelView } from "@kaitu/core";
import { type ReactNode } from "react";
import type { Request } from "./page.js";
export type WriterSource = {
    scene: NovelData["scenes"][number];
    text: string;
    path: string;
    anchor: Anchor;
};
export type WriterAgent = {
    send(project: string, text: string): Promise<void>;
    session(project: string): Promise<string>;
    render(project: string, onReply: () => void): ReactNode;
};
export declare function Writer({ project, title, request, agent, onView, onBack, }: {
    project: string;
    title: string;
    request: Request;
    agent?: WriterAgent;
    onView(view: NovelView): void;
    onBack(): void;
}): import("react").JSX.Element;
