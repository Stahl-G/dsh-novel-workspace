# 开图桌面嵌入边界

本重写版新增原生 DSH 主面板 `kaitu-novel` 与侧栏“写作”入口，只负责选择目录及打开/续用会话，正文 UI 仍由 Oh Story 提供。开图“探索 → 写作”的完整 iframe 尚须单独验收，不得把原生 DSH 测试等同于桌面验收。

## 已核实的接口

宿主基线：[rensheng-kaitu aa91087](https://github.com/Stahl-G/rensheng-kaitu/tree/aa91087fd138d160e878459a6a44d541068aa145)。

- [desktop/plugins.mjs](https://github.com/Stahl-G/rensheng-kaitu/blob/aa91087fd138d160e878459a6a44d541068aa145/packages/desktop/plugins.mjs) 只从已安装包的 `kaitu.explore` 读取标题与 `page`。生成本机 iframe URL，hash 带 `kaitu-page`、`kaitu-embed=1` 和 `kaitu-parent`。
- [ExplorePluginRoute.tsx](https://github.com/Stahl-G/rensheng-kaitu/blob/aa91087fd138d160e878459a6a44d541068aa145/packages/dsh-plugin/src/client/ExplorePluginRoute.tsx) 等待 `main` slot 里出现相同 key，才调用 `layout.selectPanel(page)`。不是任意 URL 路由。返回/继续对话消息校验 parent window 与 origin。
- [ExplorePluginEmbed.module.css](https://github.com/Stahl-G/rensheng-kaitu/blob/aa91087fd138d160e878459a6a44d541068aa145/packages/dsh-plugin/src/client/ExplorePluginEmbed.module.css) 隐藏原生 sidebar，不能假定用户在 iframe 内还能用原来的工作区选择器。
- [上游 client/index.tsx](https://github.com/zenstory-ai/oh-story-dsh/blob/ba5e6d9501ab2869db3aebdd194915dcc719b4e6/packages/dsh-plugin/src/client/index.tsx) 注册 `shell.overlay` 与 session-scoped `oh-story.workspace`；根据当前会话中的创作文件出现文件树和编辑器。它不注册开图所需的 `main` panel。
- 宿主上述提交的 [dsh-plugin/package.json](https://github.com/Stahl-G/rensheng-kaitu/blob/aa91087fd138d160e878459a6a44d541068aa145/packages/dsh-plugin/package.json) 依赖仍指向 DSH `0.2.1-rc.3`；重写版主要验证宿主为 `0.2.2-rc.1`。不据此推断用户本机版本。

## 本版的薄入口实现

本插件注册 `main` 入口与原生侧栏“写作”：`uiWorkspace.pickDirectory()` 选择目录，也可粘贴目录；`sessions.create({cwd})` 创建宿主会话，`uiWorkspace.openSession` 交还原生对话与 Oh Story 工作台。本轮打开的最近 8 个目录保留在内存中，返回可续用原会话；重启不恢复此入口清单。未引入旧小说数据库、旧正文 UI、另一套 chat 或 agent。

需要按目标宿主实际 API 实现与验收：新建和复用会话、目录选择取消、重复点击及异步导航过期、返回作品页/继续对话、空工程引导、已有工程的自动展开、切书与关闭 iframe 后不覆盖未保存草稿。依赖的 `workspaces`、`sessions`、`uiWorkspace`/当前会话选择接口必须与同一个宿主版本一致；不能把旧版接口形状直接强转后宣称兼容。

也可由宿主增加“打开原生工作区”的明确插件能力，替代 panel 契约；这需要另一个仓库的范围和测试，不在本开发包里猜测。

## 验证边界

`novel-entry-navigation.test.ts` 覆盖取消、重复点击、异步过期、失败重试、切换和返回。`native-dsh-smoke.ts` 新增真实打包点击“写作” → 打开合成书目录 → 见到上游编辑器 → 返回续用同一会话的检查。2026-11-17 在 DSH 0.2.2-rc.1 的隔离打包 Chrome 验收通过（provider=local-fixture）：实际打开上游编辑器，并核对返回前后的原生 Session ID 相同。纯合成导航测试 7 项、类型检查与 lint 同时通过。包元数据已指向经过原生验证的 main key `kaitu-novel`，不据此声称完整开图 App 已验收。未启动日常开图、未读取真实稿件；桌面 iframe 嵌入仍是发布前的独立验收项。
