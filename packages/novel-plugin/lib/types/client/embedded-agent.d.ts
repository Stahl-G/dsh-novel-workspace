import type { ISessions } from "@deepseek-ai/dsh-api-session-controller/client";
import type { PropsRuntime, PropsRenderFactories, PropsRenderSlots } from "@deepseek-ai/dsh-client-ui-slots";
import { type Request } from "./page.js";
declare module "@deepseek-ai/dsh-api-session-controller/client" {
    interface SessionReferenceSourceMap {
        novelWriter: unknown;
    }
}
declare module "@deepseek-ai/dsh-client-ui-slots" {
    interface SlotMap {
        "novel.writer.chat": {
            kind: "single";
            scope: "session";
            owner: {
                onReply(): void;
            };
        };
    }
}
export declare function WriterChat({ useSession, useConversation, renderFactorySlot, onReply, }: PropsRuntime<"novel.writer.chat"> & PropsRenderFactories): import("react").ReactNode;
export declare function EmbeddedNovelPage({ request, onAgent, services, SessionProvider, renderSlot, }: {
    request: Request;
    onAgent(text: string): Promise<void>;
    services: {
        sessions: ISessions;
        workspaces: {
            create(input: {
                path: string;
            }): Promise<{
                workspaceId: string;
            }>;
        };
    };
} & PropsRenderSlots<"novel.writer.chat">): import("react").JSX.Element;
