export type Request = <T = unknown>(operation: string, input?: object) => Promise<T>;
type Agent = (text: string) => Promise<void>;
export declare function NovelPage({ request, onAgent }: {
    request: Request;
    onAgent?: Agent;
}): import("react").JSX.Element;
export {};
