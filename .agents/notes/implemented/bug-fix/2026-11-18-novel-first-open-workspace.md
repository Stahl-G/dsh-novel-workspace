# Agent Note: 首次打开作品必须绑定原生 Workspace

Status: implemented

## Problem

独立真实 UI 验收发现：全新 DSH rc.4 profile 在写作入口打开目录可预览和编辑，但聊天显示 Choose a workspace to start，发送不可用。此前集成测试在入口测试前预建 Workspace，掩盖了新装路径。原因是 sessions.create({ cwd }) 只创建无 Workspace 归属的 Session。

## Decision

首次创建会话前通过官方 workspaces.create({ path }) 注册或幂等取得 Workspace，再用 sessions.create({ workspaceId }) 创建由宿主挂接的会话。不写宿主内部文件、不修改稿件、模型、权限或归档身份。入口校验使用该官方接口返回的规范路径，避免 macOS /var 与 /private/var 的同目录字符串差异导致拒绝；最近作品仍恢复相同 Session。旧版已生成的无归属 Session 不自动迁移、替换或删除。

## Alternatives considered

不通过测试预建 Workspace 或后台修补 registry 掩盖首开问题；不通过修改 composer 的禁用状态绕过宿主约束。

## Consequences

Host 拒绝无效目录时不再创建无归属 Session。注册成功后会话创建失败可能留下正常的空 Workspace，重试幂等复用。只有用户明确打开的目录被注册。

## Verification

增加单测验证 Workspace 先于 Session，注册失败不创建 Session。原生打包回归在任何书目录 RPC 预建前，从空白 profile UI 打开全新原创合成短书，通过真实 composer 发送本地 fixture 请求，刷新后从最近作品恢复相同聊天，核对稿件字节未变。独立 CUA 仍为公开发布门禁。
