import type { NovelData } from "@kaitu/core";
import { useState } from "react";
import base from "../../../dsh-plugin/src/client/Prototype.module.css";
import css from "./Novel.module.css";

const noteCanon = { confirmed: "作者确认", open: "不采用", ai_inference: "待你核对" };
const beatCanon = { tentative: "待定", confirmed: "作者确认", open: "保持开放" };

export function Interview({
  data,
  busy,
  onEdit,
}: {
  data: NovelData;
  busy: boolean;
  onEdit(command: object): Promise<unknown>;
}) {
  const story = data.story;
  const [spark, setSpark] = useState(story?.spark ?? "");
  const [custom, setCustom] = useState("");
  const [edits, setEdits] = useState<Record<string, string>>({});
  return (
    <div className={css.stack}>
      <section className={css.card}>
        <h2>构思新故事</h2>
        <p className={css.muted}>
          先记下你已经确定的，也记下你还想留着的。提纲是提案，不会写入正文。
        </p>
        <label>
          一句话
          <textarea
            aria-label="一句话故事"
            value={spark}
            disabled={busy}
            onChange={(event) => setSpark(event.target.value)}
            placeholder="例如：一个在月球上长大的少女，从未为生存努力，却维持不了一段亲密关系。"
          />
        </label>
        <button
          className={`${base.btn} ${base.primary}`}
          type="button"
          disabled={busy || !spark.trim()}
          onClick={() => void onEdit({ type: "story", op: "spark", text: spark.trim() })}
        >
          {story ? "用这一句重新开始" : "开始访谈"}
        </button>
      </section>
      {story && (
        <section className={css.card}>
          <h2>目前的理解</h2>
          <h3>已确认</h3>
          {story.confirmed.length ? (
            <ul>
              {story.confirmed.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className={css.muted}>还没有已确认的意图。</p>
          )}
          <h3>仍开放</h3>
          {story.open.length ? (
            <ul>
              {story.open.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className={css.muted}>还没有明确保留的开放问题。</p>
          )}
          <p className={css.muted}>
            文风样本：人工标记 {story.portrait.authorDocuments}，未标记正文 {story.portrait.unmarkedManuscripts}，AI
            标记或候选 {story.portrait.aiMarked}，格式疑似 AI {story.portrait.likelyAi}。
          </p>
          {story.portrait.notes.map((note) => (
            <article key={note.id}>
              <p>
                {note.text} <span className={css.muted}>{noteCanon[note.canon]}</span>
              </p>
              <div className={css.actions}>
                <button
                  className={base.btn}
                  type="button"
                  disabled={busy}
                  onClick={() => void onEdit({ type: "story", op: "note", id: note.id, canon: "confirmed" })}
                >
                  确认这条
                </button>
                <button
                  className={base.btn}
                  type="button"
                  disabled={busy}
                  onClick={() => void onEdit({ type: "story", op: "note", id: note.id, canon: "open" })}
                >
                  不采用
                </button>
              </div>
            </article>
          ))}
        </section>
      )}
      {story?.question && (
        <section className={css.card}>
          <h2>{story.question.prompt}</h2>
          <label>
            想换成自己的说法（可选）
            <textarea
              aria-label="自己的说法"
              value={custom}
              disabled={busy}
              onChange={(event) => setCustom(event.target.value)}
            />
          </label>
          <div className={css.choices}>
            {story.question.choices.map((choice) => (
              <button
                key={choice.id}
                className={base.btn}
                type="button"
                disabled={busy}
                onClick={() =>
                  void onEdit({
                    type: "story",
                    op: "answer",
                    choice: choice.id,
                    custom: custom.trim() || undefined,
                  }).then(() => setCustom(""))
                }
              >
                {choice.label}
              </button>
            ))}
          </div>
        </section>
      )}
      {story && story.claims.length > 0 && (
        <section className={css.card}>
          <h2>纠正理解</h2>
          {story.claims.map((claim) => (
            <article key={claim.id}>
              <textarea
                aria-label={`纠正${claim.text}`}
                value={edits[claim.id] ?? claim.text}
                disabled={busy}
                onChange={(event) => setEdits({ ...edits, [claim.id]: event.target.value })}
              />
              <div className={css.actions}>
                <button
                  className={base.btn}
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void onEdit({
                      type: "story",
                      op: "correct",
                      id: claim.id,
                      text: edits[claim.id] ?? claim.text,
                      canon: "confirmed",
                    })
                  }
                >
                  改为已确认
                </button>
                <button
                  className={base.btn}
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void onEdit({
                      type: "story",
                      op: "correct",
                      id: claim.id,
                      text: edits[claim.id] ?? claim.text,
                      canon: "open",
                    })
                  }
                >
                  改为仍开放
                </button>
              </div>
            </article>
          ))}
        </section>
      )}
      {story?.step === "outline" && (
        <section className={css.card}>
          <h2>八章提纲</h2>
          <p className={css.muted}>每一章都还是提案。确认不会创建章节文件。</p>
          <button
            className={base.btn}
            type="button"
            disabled={busy}
            onClick={() => void onEdit({ type: "story", op: "outline" })}
          >
            按现在的确认重写提纲
          </button>
          {story.beats.map((beat) => (
            <article key={beat.chapter}>
              <h3>
                第 {beat.chapter} 章 <span className={css.muted}>{beatCanon[beat.canon]}</span>
              </h3>
              <p>{beat.text}</p>
              <div className={css.actions}>
                <button
                  className={base.btn}
                  type="button"
                  disabled={busy}
                  onClick={() => void onEdit({ type: "story", op: "beat", chapter: beat.chapter, canon: "confirmed" })}
                >
                  确认这一章
                </button>
                <button
                  className={base.btn}
                  type="button"
                  disabled={busy}
                  onClick={() => void onEdit({ type: "story", op: "beat", chapter: beat.chapter, canon: "open" })}
                >
                  这一章保持开放
                </button>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
