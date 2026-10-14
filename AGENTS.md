# Agent 指令（zcode-cli-plus）

本仓库是 [zai-org/ZCode](https://github.com/zai-org/ZCode) 中 **CLI 部分**的社区维护精简分支，只包含 `apps/zcode-cli/` 及其依赖的 6 个根包（`packages/{shared,provider,provider-node,model-option-map,zcode-cua,formal-proof}`）。不包含、也不维护桌面端、Web、移动端等 GUI 代码。

CLI 内部的详细规范见 [`apps/zcode-cli/AGENTS.md`](apps/zcode-cli/AGENTS.md)（上游原文，保持不改），本文件优先级更高；其中引用的根目录 GUI 相关规则（desktop、web、ui、`mise.toml`、`scripts/check-workspace-freshness.mjs`、`pnpm verify:pre-push`、架构检查等）在本仓库不适用。

## 谁改代码

**代码改动只由 pi agent 执行。** 其他 bot（review / 指令 bot 等）只负责提出修改意见与审查，不直接改仓库文件。

## 分支模型

- `upstream`：只放上游原始快照，**只能**由 `tools/sync-upstream.sh` 生成（每周由 `upstream-sync.yml` 检查新 tag），每个上游 tag 一个提交（`sync: upstream ZCode <tag>`），通过 PR `upstream → dev` 合入。禁止手改。`ci/` 等 fork 资产只在 `dev`，不进 `upstream`。
- `dev`：日常开发集成分支。功能分支从 `dev` 切出、PR 回 `dev`。
- `main`：发布分支。只通过 PR `dev → main`（merge commit）更新；release-please 在 `main` 上维护发布 PR 和 CHANGELOG，合并发布 PR 后自动发布 npm。
- 功能分支：**一个功能一个分支、一个 PR**；命名 `feat/…`、`fix/…`、`chore/…`、`docs/…`。
- 提交信息使用 Conventional Commits（`feat:`、`fix:`、`chore:`…），release-please 据此生成版本号和 CHANGELOG。
- 抽取导致的问题（缺文件、路径、未声明依赖）在 `tools/sync-upstream.sh` 里修，不在 `upstream` 上手改。

## 发布

- 发布包 `@bssn520/zcode-cli-plus` 的描述和版本在 `npm/package.json`（release-please 版本源），由 `tools/prepare-npm-package.mjs` 把构建产物组装成发布目录；上游 `@zcode/cli` 的 package.json 不改。命令名 `zcp`（只在 `npm/package.json` 的 `bin` 改，便于以后再改）。
- 首个 npm 版本由维护者手动发；配置 Trusted Publisher 后，`release.yml` 可用 OIDC。`--provenance` 由仓库变量 `NPM_PROVENANCE` 控制（未设时：公开仓库默认开，私有默认关）。

## 最小化上游文件差异

- 改上游文件前先想能否放进新文件（新模块、新命令文件、插件、skill、hook）；必须改时只改最小必要行，不做顺手重构、格式化、重命名或移动。
- 不要对上游文件跑全量格式化或 lint `--fix`。
- 新增代码放在新文件中，在上游文件里只留注册/接线的一两行。
- 不改上游的 `apps/zcode-cli/AGENTS.md`、`README.md`、LICENSE/NOTICE 类文件；我们的说明写在根目录文件里。
- 修改过的上游文件需按 Apache-2.0 第 4(b) 条注明修改（PR 描述中列出，必要时在文件头加一行中文注释）。

## 环境

- Node **24**（CI 使用 24.14.0，见 `.nvmrc`）、pnpm **10.33.2**（`packageManager` 字段）。
- `.npmrc` 为 `node-linker=hoisted`：可执行文件在根 `node_modules/.bin`，请在**仓库根目录**用 `pnpm --filter` 运行，不要用 `pnpm --dir apps/zcode-cli build`（会找不到 `turbo`）。
- Turbo 需要在 git 仓库中运行（未 `git init` 的目录会报 Path error）。

## 常用命令（仓库根目录）

| 用途 | 命令 |
| --- | --- |
| 安装 | `pnpm install --frozen-lockfile` |
| 构建 CLI | `pnpm --filter zcode-cli build`（产物 `apps/zcode-cli/packages/cli/dist/zcode.cjs`） |
| 冒烟 | `node apps/zcode-cli/packages/cli/dist/zcode.cjs --version` |
| 类型检查 | `cd apps/zcode-cli && ../../node_modules/.bin/turbo run typecheck` |
| Lint | `pnpm lint`（根目录 `oxlint`，与上游一致；不要用 turbo lint） |
| 单包测试 | `pnpm --filter @zcode/<包名> test` |
| 全量测试闸门 | `pnpm test:ci`（需先构建） |
| 本地复现 CI | `pnpm ci:local` |

## 已知失败策略

- 上游 v3.15.1 本身有一批失败用例，记录在 `ci/known-failures.tsv`（字段：包、测试文件、用例名、上游 tag、状态 `fail`/`flaky`、可选备注）。
- `pnpm test:ci` 跑 CLI 包测试：清单内的失败被容忍，**任何清单外的新失败都会让 CI 失败**；清单内 `fail` 项变绿时会提示移除。
- 不要为了让 CI 变绿而往清单里加条目。只有确认在完整上游同 tag 下也失败（或只在并发负载下偶发失败，标 `flaky`）才能加，且需在 PR 中说明证据。切片特有失败可以收录，但必须在该行备注理由。
- 清单源文件就是 `ci/known-failures.tsv`（不在 `tools/`）。

## 继承的通用规则（摘自上游根 AGENTS.md）

- 新增或修改行为前先更新对应 spec（CLI spec 在 `apps/zcode-cli/docs/design/v2/`），明确规则、状态所有者、接口和验收场景再实现。
- 定位问题时未明确要求改代码就先调查原因，区分已确认原因与待验证假设。
- 有行为改动时先补测试；必须执行 typecheck 和 lint，如实报告结果，不把已有失败写成通过。
- 修 bug 用中文注释说明原因和修复依据；发现设计缺陷先对齐，不叠加兜底分支。
- 避免重复状态和多条写入路径；跨包导入用公开入口；使用异步文件和网络 IO。
- 不在日志、示例或提交中写入凭据、真实用户数据和内部服务地址。
- 每个功能级变更一个独立提交，不混入无关重构、依赖更新和格式调整。
