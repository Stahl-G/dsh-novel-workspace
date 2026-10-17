# DSH 小说工作台

给 DeepSeek Harness 用的小说工作台与科幻设定校对。支持章节状态、字数、写作交接、人物资料、世界书导入、设定检查，以及续写候选和外部 chatbot 提示词。

两个插件共用作品数据，可分别启停：

- **小说工作台**：关联 Markdown / TXT / DOCX 目录，管理章节与资料，批准或撤销资料修改；可选开启续写、保存候选、按要求合稿与撤销。
- **科幻校对**：读世界书和设定集，保留来源、版本、范围与虚构例外；提供单位、恒加速度、时间顺序等简单计算。

Agent 使用 DSH 自带的文件搜索和读取能力寻找正文、设定集和风格样本。点“整理外部续写提示词”，可让本地 Agent 把必要正文、世界书、人物关系、剧情目标与文风样本整理成完整 Markdown，再贴到 Gemini 等外部 chatbot。

## 安装

适配 DSH **0.2.0-rc.2**，需要 Node 22.19+ 或 24+。仓库包含构建产物，安装不用编译。

```sh
dsh plugin --profile desktop add github:Stahl-G/dsh-novel-workspace
```

重启 DSH。组合包会加载 `kaitu-novel-workspace` 和 `kaitu-novel-workspace/sf` 两行。仓库名没有特定前缀要求；自动加载由 `package.json` 中的 `dsh.bundle` 与 `cordis.patch.yml` 决定。GitHub 安装可用；尚未提交官方市场目录。

在小说工作台插件配置中，将 `workspace` 填为现有开图工作区绝对路径。在开图项目中关联稿件目录后，即可在小说工作台连接作品。科幻插件需要小说工作台服务。

## 直接试用公开示例

内置《月球上最早的人类》中文版与本项目整理的中文世界书。译本由仓库维护者提供并确认可公开使用，见 [示例说明](examples/first-men-in-the-moon/README.md)。

没有现成开图工作区也可以创建示例：

```sh
git clone https://github.com/Stahl-G/dsh-novel-workspace.git
cd dsh-novel-workspace
node dist/setup-demo.js /tmp/my-novel-demo
```

这个命令在新目录中创建工作区和公版稿件副本，打印 `workspace` 路径。将它填入插件配置后重启 DSH。可以直接说：

> 读这个作品的世界书和第三章，整理飞行器设定，标出来源和人物推测。然后对照第八章检查设定一致性。

> 根据原文和世界书，整理一份可贴到 Gemini 的续写提示词，把它需要的上下文直接放进提示词里。

默认只读；想续写时在作品中开启写作模式。示例里的月球环境和凯沃物质是小说设定，校对时应尊重书内前提。

## 文件分类与来源线索

章节列表和总字数只计算正文。世界书、设定集、大纲、笔记和参考文件保留在资料区，仍可供 Agent 引用。来源优先读元数据和明确生成标记；密集加粗、重复分隔线、模板标题、建议或免责声明式开场组合出现时，提示“格式疑似 AI 整理”并显示依据。单独的分隔线不判定 AI 来源；格式线索不改变作者确认状态。

## 开发

```sh
pnpm install
pnpm build
pnpm test
```

`packages/core/src/novel` 是共享数据层，`packages/novel-plugin` 是宿主工具与 UI，`packages/sf-plugin` 是科幻扩展。`dist` 是发行入口，构建后一起提交。

代码源于 [Stahl-G/rensheng-kaitu](https://github.com/Stahl-G/rensheng-kaitu)，基线 `92edcf3`，小说插件迭代至 `220f6d8`；此仓库独立打包。代码 MIT，打包依赖许可见 [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md)。公共示例单独注明许可。

## 验证范围

- 合成文件闭环：连接、索引、资料批准/撤销、陈旧来源、并发修改、续写合稿/撤销，及科幻计算与虚构例外测试通过。
- 临时 HOME 下创建公版示例工作区通过；独立 DSH profile 安装 tarball、从公开 GitHub 安装并识别两个插件配置通过；从 GitHub 安装的包创建示例工作区通过。
- 开发版本此前在本机 DSH 浏览器界面及真实模型上试用过；独立发行包尚未重新跑完整 UI 和真实模型流程。
