# 开图衍生版发布准备

本文件只适用于 `Stahl-G/dsh-novel-workspace`。上游 `scripts/release.mjs` 固定指向 `zenstory-ai/oh-story-dsh`，不得用于本 fork；不创建 npm 发布渠道。现有渠道是 GitHub Release 的 `.tgz` 与 `SHA256SUMS`。

## 候选与依赖

- 发布候选：`kaitu-novel-workspace@0.4.0-alpha.3`，GitHub **prerelease**，Tag `v0.4.0-alpha.3`。不能复用已交付的 alpha.2 包名承载不同字节。
- 顺序：先合入 Oh Story 重做 #13，再将 DSH rc.4 升级 #14 指向 main 并复验合入，最后将本版本准备 PR 指向 main、复验后合入。
- 保留 merge commit 和开发分支，不 squash/rebase 堆叠历史；这样下一层保留祖先关系。每层改 base 后检查实际 diff，不把已经合入的重做再次提交。
- 合并前必须各自最终头 CI 全绿；冷却期、失败或未执行不算通过。合并后还要等待最终 main SHA 的三个平台 `check` 全绿。
- 2026-11-18，npm `next` 为 DSH `0.2.2-rc.4`，`latest` 仍 rc.1。不得增加 `minimumReleaseAgeExclude` 或关闭供应链策略。已知 rc.4 包冷却应在 11/18 17:03 UTC 后结束，17:10 UTC 后重试更稳妥；以实际安装结果为准。

## 构建和验收

在最终合入 main 的干净 checkout 中，确认 `HEAD`、`origin/main` 与待发布源提交一致：

```sh
pnpm install --frozen-lockfile
pnpm verify
pnpm test:contract
pnpm test:dsh:native
```

原生 smoke 使用临时 home/profile、合成稿和本地 fixture provider。未验证真实付费模型或完整 Electron，不应在发布说明中声称验证了这些项目。

```sh
release_dir="$PWD/release"
mkdir -p "$release_dir/first" "$release_dir/second"
pnpm --filter kaitu-novel-workspace pack --pack-destination "$release_dir/first"
pnpm --filter kaitu-novel-workspace pack --pack-destination "$release_dir/second"
cmp release/first/kaitu-novel-workspace-0.4.0-alpha.3.tgz release/second/kaitu-novel-workspace-0.4.0-alpha.3.tgz
(cd release/first && shasum -a 256 kaitu-novel-workspace-0.4.0-alpha.3.tgz > SHA256SUMS)
tar -tzf release/first/kaitu-novel-workspace-0.4.0-alpha.3.tgz
```

检查打包 `package/package.json`：名字为 `kaitu-novel-workspace`，版本 alpha.3，DSH bundle/client 入口与 `lib`、许可、模板和安全导入脚本齐全，不含个人稿件、profile、密钥或依赖目录。

根包 `kaitu-oh-story-source` 是 private monorepo，**不要将仓库 Git URL 当成可直接安装的插件**。安装的单位是上述 tgz。

## 发布动作（检查通过且获授权后才执行）

先检查 Tag/Release 不存在；若存在，必须比对源 SHA 和附件校验和，只接受完全相同的已有结果，不能移动 Tag 或覆盖附件。给最终 main SHA 打带注释的 `v0.4.0-alpha.3` Tag，推送该新 Tag，再用 GitHub Release 发布同一份已验 tgz 和 SHA256SUMS，设为 prerelease，不替代稳定 Latest。

发行说明必须列明：Oh Story 重做、最近作品恢复、DSH rc.4、原稿/旧会话不自动迁移、独立 profile 安装、已测和未测边界、源 SHA 和安装命令。保持旧 v0.1.2 不变。

发布后下载公开附件并比对 SHA256SUMS；在全新合成 profile 中用固定 DSH rc.4 安装这个下载的 tgz，再做原生插件发现/打开验证。只有实际附件可下载、校验和与被测包相同后，才向用户报告已发布。

## 安装与迁移边界

沿用 [试用说明](TRY_PREVIEW.md) 的独立 `DSH_HOME`。继续 alpha.2 时使用原来的专用 home/profile；切换到不同 profile 不会搬迁旧会话。旧 v0.1.2/0.3.x 的数据格式不保证自动升级，不能覆盖唯一真稿或把整个旧配置目录直接复制到测试 profile。正文仍保存在原作品目录，原生会话归宿主管理。
