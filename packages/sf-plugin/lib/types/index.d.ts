import { type Context, Service } from "@deepseek-ai/cordis";
import type { Workspace } from "@kaitu/core";
export declare const name = "kaitu-sf-consistency";
export declare const inject: string[];
interface NovelReadContract {
    contractVersion: number;
    workspace: Workspace;
    snapshot(project: string): unknown;
}
export declare class ScienceService extends Service {
    private readonly workspace;
    constructor(ctx: Context, novel: NovelReadContract);
    request(operation: string, args: Record<string, unknown>): unknown;
}
export declare function apply(ctx: Context): void;
export {};
