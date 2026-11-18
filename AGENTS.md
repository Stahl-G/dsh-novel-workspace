# AGENTS.md

oh-story-dsh 是 DeepSeek Harness（DSH）的社区插件，发布一个包 `@oh-story/dsh`（`packages/dsh-plugin`），给 DSH Web 加小说、短剧、游戏、视频解说四个创作工作台。Agent、会话、模型与权限归 DSH，插件只加 Skills、Roles、项目文件协议和界面；归属边界见 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)。环境、测试分层与 CI 见 [`CONTRIBUTING.md`](CONTRIBUTING.md)。

## 固定上游资产

- `packages/knowledge/{oh-story,drama,novel-to-game,video-recap}` 是四套上游 Skills 的固定副本，`manifest.json` 记录上游仓库、commit 与逐文件哈希。不要手工修改这些目录。
- 只用 `pnpm assets:sync:{story,drama,game,video}`（或 `pnpm assets:sync` 全部）从相邻 checkout 同步，再跑 `pnpm assets:check`；同步提交连同 manifest 一起评审，`CHANGELOG.md` 写清上游版本号与提交。上游路径与破坏性版本的要求见 `CONTRIBUTING.md`「上游知识资产」。

## 验证

- 报告完成前运行 `pnpm verify`（lint、类型、资产完整性、DSH 边界、单测与构建）。单独检查可用 `pnpm lint`、`pnpm typecheck`、`pnpm assets:check`、`pnpm test`。
- 发版前运行 `pnpm verify:release`（`verify` 加打包后原生 DSH Web 集成测试）。
- `pnpm test:dsh:real` 与 `pnpm demo` 调用真实 DeepSeek，只在发布前观察 provider 兼容性或重做演示图时运行；缺凭据的 skipped 不算 passed。凭据只放环境变量或临时 Key 文件，不写入仓库。

## 发布

只按 [`docs/RELEASING.md`](docs/RELEASING.md) 发布：版本、安装示例与 `CHANGELOG.md` 先更新，经受保护的 PR 合入 `main` 且该提交的 main CI 四个 Job 全部通过后，才在该提交打与包版本一致的 `v<package-version>` Tag，由 `release.yml` 发布。不要移动 Tag、覆盖已发布资产，也不要绕过工作流手动发 npm。`CHANGELOG.md` 只记用户可见变更，正文中文。

## 决策笔记

非平凡改动（行为、架构、跨模块契约、流程或工具、测试策略、磁盘格式）在 `.agents/notes/{proposed,implemented,rejected}/{feature,bug-fix,simplification,architecture,process,testing}/yyyy-mm-dd-topic.md` 留笔记，日期取该决定首次出现的提交，遵循 [DeepSeek Harness agent-notes 约定](https://github.com/czm15053/write-notes-like-deepseek)。

- 先在 `.agents/notes/` 找已有笔记：决定不变就原地更新事实；决定反转就开新笔记并链接旧笔记，不把 `## Decision` 改成相反内容。
- 新想法放 `proposed/`，与代码同一提交移到 `implemented/`。格式化、改名、版本号等机械改动不需要笔记。
- 笔记开头是 `# Agent Note: <标题>`、空行、`Status: <状态>`；正文中文、小节标题英文：`## Problem`、`## Decision`（现在时）或 `## Proposal`、`## Alternatives considered`、`## Consequences`（`proposed/` 与 `rejected/` 用 `## Risks`），结尾给 `来源：` 提交列表或 `## Verification`。
- 不建 `INDEX.md`，目录本身就是状态。

## 开图衍生版

以上是固定上游的维护约定，不授权向上游或 npm 发布。此分支产品包为 kaitu-novel-workspace；不合并、不发布、不改变开图用户的配置。保留上游许可、原生 DSH 会话与模型权限。工程测试仅用隔离目录、合成稿件及本地 fixture provider。不要测试或提交私人原稿、密钥、世界书或会话。旧仓库代码不是本版运行基底。Avoid unnecessary secondary labels and descriptions. Let the layout do the explaining.
