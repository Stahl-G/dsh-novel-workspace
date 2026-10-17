import type { Context } from "@deepseek-ai/cordis";
export declare const inject: string[];
declare global {
    interface Window {
        __kaituNovelStyles: string;
    }
}
export declare function apply(ctx: Context): Promise<void>;
