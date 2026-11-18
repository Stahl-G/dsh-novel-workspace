# Agent Note: 以原生会话打开小说作品

Status: implemented

## Problem

Oh Story 只有 shell.overlay，开图探索页需要一个真实 main panel。仅增加包元数据会形成死入口，且嵌入时原生侧栏被隐藏。

## Decision

新增一个薄的 kaitu-novel 主面板及原生侧栏入口，只选目录、创建或复用当前插件实例打开过的宿主会话，再交还原生对话与上游工作台。使用官方 uiWorkspace 与 sessions 服务，不复制旧小说数据层、编辑器或模型管线。目录选择可取消，手动路径是明确备用入口；临时最近列表不持久化。

## Alternatives considered

不将 sidebar.workspaces 直接搬进 main：renderSlot 权限属于它的声明父项。不通过只改 hash 或直接 selectPanel(null) 假装可选择作品。完整开图 iframe 尚需独立验收。

## Consequences

包新增两个官方 UI peer/dev 依赖。普通 DSH 新增一个用户主动点击的写作入口，其余会话行为不变。异步取消可能在宿主留下已经创建但未打开的空会话；不擅自删除宿主数据。

## Verification

7 项导航单元测试、typecheck 与 lint 通过。DSH 0.2.2-rc.1 打包 Chrome smoke 已通过，实际打开合成目录后出现上游编辑器，返回入口后复用相同原生会话 ID，provider=local-fixture，无真实模型调用。见 docs/KAITU_EMBED.md 的精确宿主源码依据。
