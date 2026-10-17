import { type WriterAgent } from "./Writer.js";
export type Request = <T = unknown>(operation: string, input?: object) => Promise<T>;
type Agent = (text: string) => Promise<void>;
export declare function NovelPage({ request, onAgent, writerAgent, }: {
    request: Request;
    onAgent?: Agent;
    writerAgent?: WriterAgent;
}): import("react").JSX.Element;
export {};
