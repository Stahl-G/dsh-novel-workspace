# 开图桌面嵌入边界

本重写版新增原生 DSH 主面板 `kaitu-novel` 与侧栏“写作”入口，只负责选择目录及打开/续用会话，正文 UI 仍由 Oh Story 提供。开图“探索 → 写作”的宿主路由与实际 DSH iframe 已在合成工程通过联验；这与完整 Electron 安装器、用户本机数据或模型写作质量验收不同。

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

`novel-entry-navigation.test.ts` 覆盖取消、重复点击、异步过期、失败重试、切换和返回。`native-dsh-smoke.ts` 新增真实打包点击“写作” → 打开合成书目录 → 见到上游编辑器 → 返回续用同一会话的检查。2026-11-17 在 DSH 0.2.2-rc.1 的隔离打包 Chrome 验收通过（provider=local-fixture）：实际打开上游编辑器，并核对返回前后的原生 Session ID 相同。纯合成导航测试 7 项、类型检查与 lint 同时通过。包元数据已指向经过原生验证的 main key `kaitu-novel`，不据此声称完整开图 App 已验收。未启动日常开图、未读取真实稿件；针对开图宿主的独立 iframe 联验见下节。


## 隔离联验（2026-11-17）

读取真实安装包的 `kaitu.explore` 元数据，通过宿主 `createPluginService.explore/page` 生成 iframe 入口。在官方 DSH **0.2.1-rc.3** 中加载上述 commit 的生产 `ExplorePluginRoute.tsx` 与 CSS，接收当前 iframe 窗口与父 origin 的导航信息。浏览器用合成目录完成首次使用向导后操作：进入“写作”、打开副本、看到 Oh Story 编辑器、通过父宿主消息返回“写作”并继续同一会话。导航状态按 `false → true → false → true` 变化。该检查使用环回地址与本地模拟 provider，不读日常配置、真实稿或 API key。

这不是“整套桌面已装好”：测试组合了宿主实际发现服务、路由/样式及官方 DSH Web。外层窗口为浏览器测试页而非 Electron 安装包；测试准备仅就错误类型替代了宿主服务中与导航无关的聚合依赖。未执行真实模型写作，也未在日常桌面安装。

### 复跑
先安装本插件的冻结依赖，并准备一个干净的开图宿主检出（本次为上文 aa91087）。安装 Node.js 24.9+、pnpm 11.22.0 和 Chrome 后运行：

```sh
node scripts/test-kaitu-embed.mjs /path/to/rensheng-kaitu-checkout
```

脚本会报告宿主 Git 提交、发现服务/路由/样式的 SHA-256、DSH 版本、合成验收及导航事件。测试只验证指定宿主源码组合，不替代最终发布包、首次安装器、升级迁移和模型写作验收。

### Alpha.2：不靠浏览器缓存找回原书（2026-11-18）

Alpha.1 在销毁页面重新进入后丢失最近列表，原先的“返回”测试并没有测到它。回归用的是合成书和本地 fixture provider。同一本书先打开并留下一条合成聊天标记，检查宿主已记住该会话，再进行下面的操作，测试不替界面写入任何最近记录：

1. 硬重载并重进写作：最近列表找到原书。恢复原生会话 ID 与聊天标记。
2. 再手动输入同一目录：前后宿主会话 ID 集合相同，没有创建新会话。合成正文逐文件比较不变。
3. **实际停止** DSH 0.2.1-rc.3，在另一空闲端口以同一 DSH home/profile 再启动；用不带旧浏览器存储的全新 context 打开生产宿主 iframe。未重新选目录，最近作品即出现；进入后仍是相同会话 ID、之前的聊天和未改动的稿件。
4. 原生 DSH 0.2.2-rc.1 的整套浏览器烟测另行验证硬重载后的同 ID、聊天、会话数和正文；这里没有把完整 Electron 安装器或每种运行环境都算作已验证。

最近作品最多保存八个明确打开的原生会话 ID，保存在当前宿主提供的 profile 目录，用认证 RPC 访问；不保存作品路径、稿件或对话。路径在当前宿主索引中现查。新建 profile/换设备不自动同步旧会话；存储暂时不可用时仍可手动指定原目录，找回当前宿主中可用的主会话。
