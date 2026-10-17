import type { CreatorPortrait, PortraitNote, StoryBeat, StoryBrief, StoryClaim, StoryQuestion } from "./model.js";

export interface PortraitSource {
  role: "manuscript" | "setting" | "outline" | "notes" | "reference" | "candidate";
  origin: "author" | "ai" | "likely_ai" | "unknown";
  text: string;
}

const steps = ["conflict", "dilemma", "reader", "keep"] as const;

const questions: Record<(typeof steps)[number], StoryQuestion & { canon: Record<string, "confirmed" | "open"> }> = {
  conflict: {
    id: "conflict",
    prompt: "你最想先谈哪一种矛盾？",
    choices: [
      { id: "want-vs-world", label: "人物想要的，和这个世界允许的，不一样" },
      { id: "two-wants", label: "两个人要的结果相反" },
      { id: "setting-only", label: "我只喜欢这个设定，主题还没定" },
      { id: "stay-open", label: "先别收成一种矛盾" },
    ],
    canon: {
      "want-vs-world": "confirmed",
      "two-wants": "confirmed",
      "setting-only": "open",
      "stay-open": "open",
    },
  },
  dilemma: {
    id: "dilemma",
    prompt: "如果有人想离开，另一个人想留住承诺，你希望先写谁的困境？",
    choices: [
      { id: "leaver", label: "先写想离开的人的困境" },
      { id: "keeper", label: "先写想留下承诺的人的困境" },
      { id: "both", label: "两边都写，不判谁对" },
      { id: "undecided", label: "还没决定故事站在谁那边" },
    ],
    canon: { leaver: "confirmed", keeper: "confirmed", both: "confirmed", undecided: "open" },
  },
  reader: {
    id: "reader",
    prompt: "读完之后，你希望读者带着什么离开？",
    choices: [
      { id: "unease", label: "感到不安，但说不清错在谁" },
      { id: "tenderness", label: "仍愿意靠近这些人" },
      { id: "question", label: "带着一个问题离开" },
      { id: "unset", label: "结局情绪先开放" },
    ],
    canon: { unease: "confirmed", tenderness: "confirmed", question: "confirmed", unset: "open" },
  },
  keep: {
    id: "keep",
    prompt: "有什么要留下来，先不要被解释掉？",
    choices: [
      { id: "motive", label: "不要解释角色为什么无法亲密" },
      { id: "world", label: "不要把设定讲成说明书" },
      { id: "accident", label: "保留突然出现、还没命名的细节" },
      { id: "later", label: "这些都可以后来再定" },
    ],
    canon: { motive: "confirmed", world: "confirmed", accident: "confirmed", later: "open" },
  },
};

function voiceNote(sources: PortraitSource[]): string {
  const sample = sources
    .filter((source) => source.role === "manuscript" && source.origin !== "ai" && source.origin !== "likely_ai")
    .map((source) => source.text)
    .join("\n");
  if (sample.trim().length < 40) return "还没有足够的未标记正文来判断人称。AI 标记和候选稿不拿来当文风。";
  const first = (sample.match(/我/g) ?? []).length;
  const third = (sample.match(/他|她/g) ?? []).length;
  if (first >= 3 && first >= third) return "未标记正文里第一人称比较多。这是数出来的，可以改。";
  if (third >= 3 && third > first) return "未标记正文里第三人称比较多。这是数出来的，可以改。";
  return "未标记正文的人称还不明显，先不规定视角。";
}

export function portraitFrom(sources: PortraitSource[]): CreatorPortrait {
  const notes: PortraitNote[] = [
    {
      id: "sample",
      canon: "ai_inference",
      text: "文风只参考未标成 AI 的正文。标了 AI、格式疑似 AI，或角色是候选稿的文件，不进入画像。",
    },
    { id: "voice", canon: "ai_inference", text: voiceNote(sources) },
  ];
  return {
    authorDocuments: sources.filter((source) => source.role === "manuscript" && source.origin === "author").length,
    unmarkedManuscripts: sources.filter((source) => source.role === "manuscript" && source.origin === "unknown").length,
    aiMarked: sources.filter((source) => source.origin === "ai" || source.role === "candidate").length,
    likelyAi: sources.filter((source) => source.origin === "likely_ai").length,
    notes,
  };
}

function lists(story: StoryBrief) {
  story.confirmed = story.claims.filter((claim) => claim.canon === "confirmed").map((claim) => claim.text);
  story.open = story.claims.filter((claim) => claim.canon === "open").map((claim) => claim.text);
}

function confirmedText(story: StoryBrief, kind: StoryClaim["kind"]) {
  return story.claims.find((claim) => claim.kind === kind && claim.canon === "confirmed")?.text;
}

export function outlineFrom(story: StoryBrief): StoryBeat[] {
  const conflict = confirmedText(story, "conflict");
  const dilemma = confirmedText(story, "dilemma");
  const reader = confirmedText(story, "reader");
  const keep = confirmedText(story, "keep");
  const lines = [
    `只呈现这个设定：${story.spark}。这一章不解释主题。`,
    conflict ? `让这件事发生一次，先不给答案：${conflict}` : "矛盾还开着。这一章只让人物碰到一件具体的小事，不命名主题。",
    "写一段关系里的日常。不推进结局，允许出现还没用上的细节。",
    dilemma ? `这一章站在这个困境里：${dilemma}` : "还没决定故事站在谁那边。两种处境都出现，不替作者选择。",
    "留一处作者还没命名的意外，不回收成伏笔说明。",
    reader ? `读者读完这一章应靠近这种体验：${reader}` : "读者体验还开放。这一章不设计情绪落点。",
    keep ? `这里遵守作者要保留的开放：${keep}` : "作者还没指定什么不能解释。不要主动补完身世或设定说明书。",
    "停在仍未决定的问题上。不写最终结局，不改已有正文。",
  ];
  return lines.map((text, index) => ({ chapter: index + 1, text, canon: "tentative" }));
}

function finish(story: StoryBrief) {
  lists(story);
  if (story.step === "outline") story.question = null;
  else {
    const question = questions[story.step];
    story.question = { id: question.id, prompt: question.prompt, choices: question.choices };
  }
  story.updatedAt = new Date().toISOString();
}

function claimText(label: string, custom: string | undefined, canon: "confirmed" | "open") {
  const text = (custom ?? "").trim();
  if (text.length > 280) throw new Error("这一句太长，先留能读完的一句");
  if (canon === "confirmed" && text) return text;
  if (canon === "open" && text) return text;
  return label;
}

export function applyStory(story: StoryBrief | undefined, input: unknown, sources: PortraitSource[]): StoryBrief {
  const command = input as {
    op?: string;
    text?: string;
    choice?: string;
    custom?: string;
    id?: string;
    canon?: string;
    chapter?: number;
  };
  if (command.op === "spark") {
    const text = (command.text ?? "").trim();
    if (!text) throw new Error("先用一句话写下这个故事");
    if (text.length > 500) throw new Error("这一句太长，先留一句能读完的灵感");
    const next: StoryBrief = {
      spark: text,
      claims: [],
      beats: [],
      portrait: portraitFrom(sources),
      step: "conflict",
      confirmed: [],
      open: [],
      question: null,
      updatedAt: "",
    };
    finish(next);
    return next;
  }
  if (!story?.spark) throw new Error("先用一句话写下这个故事");
  const next: StoryBrief = {
    ...story,
    claims: story.claims.map((claim) => ({ ...claim })),
    beats: story.beats.map((beat) => ({ ...beat })),
    portrait: { ...story.portrait, notes: story.portrait.notes.map((note) => ({ ...note })) },
  };
  if (command.op === "answer") {
    if (next.step === "outline") throw new Error("访谈已经收成提纲，可以改每一章的确认状态");
    const question = questions[next.step];
    const choice = question.choices.find((item) => item.id === command.choice);
    if (!choice) throw new Error("请选择这一轮的一个回答");
    const canon = question.canon[choice.id] ?? "open";
    next.claims = next.claims.filter((claim) => claim.kind !== question.id);
    next.claims.push({
      id: question.id,
      kind: question.id,
      text: claimText(choice.label, command.custom, canon),
      canon,
    });
    const index = steps.indexOf(next.step);
    const following = steps[index + 1];
    if (following) next.step = following;
    else {
      next.step = "outline";
      next.beats = outlineFrom(next);
    }
  } else if (command.op === "correct") {
    const claim = next.claims.find((item) => item.id === command.id);
    if (!claim) throw new Error("找不到这条意图");
    const text = (command.text ?? "").trim();
    if (!text || text.length > 280) throw new Error("改成一句能读完的话");
    if (command.canon !== "confirmed" && command.canon !== "open") throw new Error("确认或保持开放");
    claim.text = text;
    claim.canon = command.canon;
  } else if (command.op === "note") {
    const note = next.portrait.notes.find((item) => item.id === command.id);
    if (!note) throw new Error("找不到这条画像");
    if (command.canon !== "confirmed" && command.canon !== "open") throw new Error("确认或保持开放");
    note.canon = command.canon;
  } else if (command.op === "beat") {
    const beat = next.beats.find((item) => item.chapter === command.chapter);
    if (!beat) throw new Error("提纲还没生成");
    if (command.canon !== "tentative" && command.canon !== "confirmed" && command.canon !== "open")
      throw new Error("章节可以确认、恢复待定，或保持开放");
    beat.canon = command.canon;
  } else if (command.op === "outline") {
    if (next.step !== "outline") throw new Error("四轮问答之后再收成提纲");
    next.beats = outlineFrom(next);
  } else throw new Error("未知构思操作");
  finish(next);
  return next;
}
