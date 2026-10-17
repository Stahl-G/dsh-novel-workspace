import type {
  ISessions,
  SessionReference,
  SessionSnapshot,
} from "@deepseek-ai/dsh-api-session-controller/client";
import type { ConversationViewsProps } from "@deepseek-ai/dsh-client-ui-conversation/client";
import type { PropsRuntime, PropsRenderFactories, PropsRenderSlots } from "@deepseek-ai/dsh-client-ui-slots";
import { useEffect, useRef, useState } from "react";
import { NovelPage, type Request } from "./page.js";

declare module "@deepseek-ai/dsh-api-session-controller/client" {
  interface SessionReferenceSourceMap {
    novelWriter: unknown;
  }
}
declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface SlotMap {
    "novel.writer.chat": { kind: "single"; scope: "session"; owner: { onReply(): void } };
  }
}
function ChatView(props: ConversationViewsProps) {
  return <>{props.renderSlot("conversation.session", { view: "chat" })}</>;
}
export function WriterChat({
  useSession,
  useConversation,
  renderFactorySlot,
  onReply,
}: PropsRuntime<"novel.writer.chat"> & PropsRenderFactories) {
  const session = useSession((v: SessionSnapshot) => v);
  const conversation = useConversation((v) => v);
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !session.running) onReply();
    wasRunning.current = session.running;
  }, [session.running, onReply]);
  const active =
    conversation.activeTargets.size > 0 || (!session.blank && !session.awaitingFirstTurn) || session.running;
  return renderFactorySlot(
    "conversation.content",
    { variant: "embedded", phase: active ? "active" : "hero", hero: !active },
    { slots: { views: ChatView } },
  );
}
export function EmbeddedNovelPage({
  request,
  onAgent,
  services,
  SessionProvider,
  renderSlot,
}: {
  request: Request;
  onAgent(text: string): Promise<void>;
  services: {
    sessions: ISessions;
    workspaces: { create(input: { path: string }): Promise<{ workspaceId: string }> };
  };
} & PropsRenderSlots<"novel.writer.chat">) {
  const references = useRef(new Map<string, SessionReference>());
  const [, redraw] = useState(0);
  useEffect(
    () => () => {
      for (const ref of references.current.values()) ref.release();
      references.current.clear();
    },
    [],
  );
  return (
    <NovelPage
      request={request}
      onAgent={onAgent}
      writerAgent={{
        async send(project, text) {
          let reference = references.current.get(project);
          if (!reference) {
            const workspace = await request<{ path: string }>("workspace");
            const target = await services.workspaces.create({ path: workspace.path });
            const id = await services.sessions.create({
              workspaceId: target.workspaceId as NonNullable<
                Parameters<ISessions["create"]>[0]
              >["workspaceId"],
            });
            reference = services.sessions.retain(id, { source: "novelWriter" });
            references.current.set(project, reference);
            try {
              await reference.ready;
            } catch (e) {
              reference.release();
              references.current.delete(project);
              throw e;
            }
            redraw((n) => n + 1);
          }
          const binding = await reference.ready;
          const result = await binding.session.prompt([{ type: "text", text }], "queue");
          if (!result.ok) throw new Error(result.error.message);
        },
        render(project, onReply) {
          const ref = references.current.get(project);
          return ref ? (
            <SessionProvider key={ref.sessionId} session={ref}>
              {renderSlot("novel.writer.chat", { onReply })}
            </SessionProvider>
          ) : (
            <p style={{ color: "var(--muted)", padding: "20px 6px" }}>
              选择上方操作开始。对话会显示在这里，可继续追问、选择模型或停止生成。
            </p>
          );
        },
      }}
    />
  );
}
