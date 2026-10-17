import { type ReactNode, useEffect, useRef, useState } from "react";
import { Group, Panel, Separator, useDefaultLayout } from "react-resizable-panels";
import css from "./Writer.module.css";

export function WriterPanels({
  storageKey,
  navigation,
  reference,
  manuscript,
  assistant,
}: {
  storageKey: string;
  navigation: ReactNode;
  reference: ReactNode;
  manuscript: ReactNode;
  assistant: ReactNode;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [vertical, setVertical] = useState(false);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setVertical(entry.contentRect.width < 760);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const panes = [
    { id: "navigation", label: "章节与资料", content: navigation, min: vertical ? 60 : 90, size: "12%" },
    { id: "reference", label: "对照资料", content: reference, min: vertical ? 120 : 180, size: "27%" },
    { id: "manuscript", label: "小说正文", content: manuscript, min: vertical ? 160 : 220, size: undefined },
    { id: "assistant", label: "写作助手", content: assistant, min: vertical ? 200 : 280, size: "34%" },
  ].filter((pane) => pane.content);
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: `${storageKey}:${vertical ? "vertical" : "horizontal"}`,
    panelIds: panes.map((pane) => pane.id),
    onlySaveAfterUserInteractions: true,
  });
  return (
    <div className={css.columns} ref={container}>
      <Group
        orientation={vertical ? "vertical" : "horizontal"}
        defaultLayout={defaultLayout}
        onLayoutChanged={onLayoutChanged}
        style={{ width: "100%", height: "100%" }}
      >
        {panes.map((pane, index) => (
          <PanelWithSeparator key={pane.id} pane={pane} previous={panes[index - 1]?.label} />
        ))}
      </Group>
    </div>
  );
}

function PanelWithSeparator({
  pane,
  previous,
}: {
  pane: { id: string; label: string; content: ReactNode; min: number; size: string | undefined };
  previous?: string;
}) {
  return (
    <>
      {previous && (
        <Separator
          className={css.separator}
          aria-label={`调整${previous}与${pane.label}宽度`}
          title="拖动调整，或使用方向键"
        />
      )}
      <Panel id={pane.id} minSize={pane.min} defaultSize={pane.size} className={css.pane}>
        {pane.content}
      </Panel>
    </>
  );
}
