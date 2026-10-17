import { type WriterAgent } from "./Writer.js";
export type Request = <T = unknown>(operation: string, input?: object) => Promise<T>;
export type FolderListing = {
    path: string;
    home: string;
    crumbs: {
        name: string;
        path: string;
    }[];
    entries: {
        name: string;
        path: string;
        hidden: boolean;
    }[];
    truncated: boolean;
};
type Agent = (text: string) => Promise<void>;
export declare function NovelPage({ request, onAgent, writerAgent, onBrowseFolder, }: {
    request: Request;
    onAgent?: Agent;
    writerAgent?: WriterAgent;
    onBrowseFolder?(path?: string): Promise<FolderListing>;
}): import("react").JSX.Element;
export {};
