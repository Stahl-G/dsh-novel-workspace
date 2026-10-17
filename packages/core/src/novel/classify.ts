import { parseDocument } from "yaml";

export interface NovelClassification {
  role: "manuscript" | "setting" | "outline" | "notes" | "reference" | "candidate";
  origin: "author" | "ai" | "likely_ai" | "unknown";
  evidence: string[];
}

/** File purpose and generation evidence are independent: an AI draft can still be prose. */
export function classifyNovelDocument(path: string, text: string): NovelClassification {
  const result: NovelClassification = {
    role: "manuscript",
    origin: "unknown",
    evidence: [],
  };
  const header = text.slice(0, 3000);
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  const parsed = front ? parseDocument(front[1] ?? "") : null;
  const meta = parsed && !parsed.errors.length ? parsed.toJS() : null;
  const declared = meta && typeof meta === "object" ? meta : {};
  const role = String(declared.role ?? declared.document_type ?? declared.type ?? "");
  const location = `${path}\n${header.split("\n").find((line) => /^#\s/.test(line)) ?? ""}`;
  const title = `${path.split(/[/\\]/).at(-1)}\n${header.split("\n").find((line) => /^#\s/.test(line)) ?? ""}`;
  if (/候选|AI[ _-]?草稿|candidate/i.test(location)) result.role = "candidate";
  else if (/(?:^|[/\\])(?:README|AGENTS|DESIGN)\.(md|txt)$/i.test(path)) result.role = "notes";
  else if (/世界书|设定集|设定|规则|worldbook|world.?bible/i.test(title)) result.role = "setting";
  else if (/大纲|总纲|分镜|outline/i.test(title)) result.role = "outline";
  else if (/参考资料|外部来源|reference/i.test(location)) result.role = "reference";
  else if (/笔记|修改意见|修改建议|工作单|修订说明|写作提示/i.test(location)) result.role = "notes";
  else if (/大纲|设定|worldbook/i.test(path)) result.role = "setting";
  const roles: Record<string, NovelClassification["role"]> = {
    manuscript: "manuscript",
    正文: "manuscript",
    setting: "setting",
    世界书: "setting",
    outline: "outline",
    大纲: "outline",
    notes: "notes",
    reference: "reference",
    candidate: "candidate",
  };
  if (roles[role]) result.role = roles[role]!;
  result.evidence.push(roles[role] ? "文件元数据声明用途" : `目录或标题识别：${result.role}`);

  const origin = String(declared.origin ?? declared.generated_by ?? declared.author ?? "");
  if (/^(human|author|人工|作者|手写)$/i.test(origin) || /作者手写|人工撰写/.test(path)) {
    result.origin = "author";
    result.evidence.push("明确的人工来源标记");
  } else if (
    /^(ai|agent|ChatGPT|Claude|Gemini|DeepSeek)(?:[ -].*)?$/i.test(origin) ||
    /(?:由\s*(?:AI|ChatGPT|Claude|Gemini|DeepSeek)\s*(?:生成|撰写)|(?:来源|生成工具|生成方式)[:：]\s*(?:AI|ChatGPT|Claude|Gemini|DeepSeek)|(?:^|\n)\s*(?:>\s*)?(?:AI[ _-]?生成|AI[ _-]?候选))/im.test(
      header,
    )
  ) {
    result.origin = "ai";
    result.evidence.push("明确的 AI 生成标记");
  } else {
    const bold = (text.match(/\*\*[^*\n]+\*\*/g) ?? []).length;
    const separators = (text.match(/^\s*(?:\*\s*){3,}$|^\s*-{3,}\s*$/gm) ?? []).length;
    const headings = (text.match(/^#{1,6}\s/gm) ?? []).length;
    const wrapper =
      /以下(?:是|为).{0,35}(?:整理|建议|方案|设定|版本)|仅供参考|免责声明|作为(?:一个|一名)?(?:AI|人工智能)|这份.{0,12}(?:采用什么|不保证什么)/.test(
        header,
      );
    const evidence: string[] = [];
    if (bold >= 12) evidence.push(`密集加粗（${bold}处）`);
    if (separators >= 3) evidence.push(`重复分隔线（${separators}处）`);
    if (headings >= 6) evidence.push(`模板式多级标题（${headings}处）`);
    if (wrapper) evidence.push("说明、建议或免责声明式开场");
    // Formatting is a suggestion, never a claim of authorship or canon status.
    if (evidence.length >= 2 && (bold >= 12 || wrapper)) {
      result.origin = "likely_ai";
      result.evidence.push(...evidence);
    }
  }
  return result;
}
