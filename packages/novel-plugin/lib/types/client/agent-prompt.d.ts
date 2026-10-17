import type { Context } from "@deepseek-ai/cordis";
export interface KaituSessionServices {
    workspaces: {
        create(input: {
            path: string;
        }): Promise<{
            workspaceId: string;
        }>;
    };
    sessions: {
        create(input: {
            workspaceId: string;
        }): Promise<string>;
        scope(id: string): Context | undefined;
    };
    uiWorkspace: {
        openSession(id: string): void;
    };
    conversation: {
        input: {
            for(scope: Context): {
                setDraft(text: string): void;
            };
        };
    };
    layout: {
        beginNavigation(): AbortSignal;
    };
}
export declare function openKaituSession(services: KaituSessionServices, workspace: string, text?: string): Promise<boolean>;
