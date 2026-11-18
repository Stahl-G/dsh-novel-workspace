# 开图小说工作台 · Oh Story 重写版

在原生 DeepSeek Harness 中写作。文件树、编辑器、会话、长短篇写作、拆书、审稿与连贯性追踪都来自 [Oh Story DSH v0.1.26](https://github.com/zenstory-ai/oh-story-dsh/tree/v0.1.26)。本项目直接在上游源码上开发，不加载旧版开图写作插件。上游的短剧、游戏和解说模块仍可使用；本轮不扩展，也不触发任何付费媒体生成。

## 从一本书开始

在独立测试 profile 中添加一个新工作区，在原生会话输入“只讨论下一场戏，不写正文”，或 `/story-long-write`、`/story-short-write`、`/story-review`。长篇沿用上游的设定、大纲、正文、追踪目录。新增章节仍受细纲门禁保护，不把通用编辑冲突保护当成作者逐条采纳。

**给这本书定规则，不给所有作品下规矩。** 如需书级约定，复制 `templates/creative-brief.md` 为本书的 `设定/创作约定.md`。可以只填一两条：哪些设定已确认、哪些答案还没定，人物遇事怎么选，哪些虚构前提不必拿现实物理反驳，哪些片段才是作者本人的声音。没有这份文件，照常写；不会把一本书的选择写进另一本。它是给写作/审稿角色的上下文，并非能判定文风或科学真伪的硬校验器。

**旧稿先做副本。** 下面是合成文件路径的示例。命令只接受一个点名的普通 UTF-8 Markdown/TXT 文件，目标必须不存在：

```sh
node scripts/kaitu-book.mjs prepare --source "./示例旧稿.md" --destination "./新作品副本" --with-creative-brief
```

最后一个开关可省略；不指定就不创建创作约定。这个命令不改原文件、不上传文本、不调用模型、不冒充完成拆书。要构建可续写的工程，在隔离工作区把复制件交给 `/story-import`。DOCX 目前请在原编辑器另存一份 TXT/Markdown。旧版候选、采纳/撤销历史、科幻校对规则不自动迁移；第一次请用合成或公开文稿，并保留旧数据。

## 作者写，AI 帮忙核对

在“写作”里打开书后，可以直接说：“只给我语法和设定建议，别改正文；把需要我决定的地方单列。”需要可选续写时再明确要求。书内可算的事实和文学选择分开处理。例如用 `/story-review` 核对“已确认匀速每圈 8 分钟、无停留和例外，同一圈道走 2 圈，正文却记为 19 分钟”。指定条件满足时，只读工具计算应为 16 分钟；条件不明则不判。它不查证真实物理，不把模型猜测升级成作者设定，也不自动采纳或写回。参考[合成作者闭环](https://github.com/Stahl-G/dsh-novel-workspace/blob/codex/oh-story-novel-rewrite/docs/AUTHOR_LOOP.md)。

## 本地构建并在隔离 profile 验收

需要 Node.js **24.9+**、pnpm **11.22.0**。这里提供的是开发源码，不是已上架的发行物；不要把 GitHub 仓库根目录作为已构建的插件覆盖日常安装。

```sh
pnpm install --frozen-lockfile
pnpm verify
pnpm pack:preview
```

打包产物为 `dist/kaitu-novel-workspace-0.4.0-alpha.2.tgz`。在专门的 DSH 测试 home、全新 profile 和合成作品目录中，使用 DSH `0.2.2-rc.1` 的 `dsh plugin --profile web add <打包文件的绝对路径>`，再从同一环境启动 `dsh web`。不要把上游原版和本衍生版装在同一个 profile：保留了上游的工具、路由及工作台。原生 DSH 侧栏“写作”可打开作品目录。下次从“最近打开的作品”继续；只保留最近八个曾在写作入口主动打开的会话，不列普通聊天，也不在稿件目录写入跟踪文件。复用同一 DSH home 和 profile，旧稿仍保存在原作品目录。插件也登记了开图“探索→写作”要求的主面板；开图固定的 DSH 0.2.1-rc.3 已通过实际发现服务及 iframe 路由联验，见[桌面嵌入验证边界](https://github.com/Stahl-G/dsh-novel-workspace/blob/codex/oh-story-novel-rewrite/docs/KAITU_EMBED.md)。这不是自动迁移或替换日常安装的开关。

`pnpm test:book` 验证纯合成复制场景；`pnpm test:dsh` 运行上游的隔离 DSH Web/打包 Chrome 测试（使用本地 fixture provider），不证明真实模型能产生好小说。常用架构与使用说明：[来源与许可](UPSTREAM.md)、[上游使用文档](https://github.com/zenstory-ai/oh-story-dsh/blob/v0.1.26/README.md)、[原生工作台架构](https://github.com/zenstory-ai/oh-story-dsh/blob/v0.1.26/docs/ARCHITECTURE.md)。
