import { type Context, Service } from "@deepseek-ai/cordis";
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { Workspace, novelView } from "@kaitu/core";
export declare const name = "kaitu-novel-workspace";
export declare const inject: string[];
export interface Config {
    workspace?: string;
}
interface ScienceService {
    request(operation: string, input: Record<string, unknown>): unknown;
}
declare module "@deepseek-ai/cordis" {
    interface Context {
        kaituNovel: NovelService;
        kaituNovelData: NovelDataService;
        kaituScience: ScienceService;
    }
}
export declare class NovelService extends TypertRemoteService {
    private readonly workspace;
    constructor(ctx: Context, workspace: Workspace);
    private snapshot;
    private grill;
    private scene;
    request(operation: string, input: string): Promise<string>;
}
export declare class NovelDataService extends Service {
    readonly workspace: Workspace;
    readonly contractVersion: number;
    constructor(ctx: Context, workspace: Workspace);
    snapshot(project: string): ReturnType<typeof novelView>;
}
export declare function apply(ctx: Context, config?: Config): void;
export {};
