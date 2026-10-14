# 贡献指南

感谢参与！提交前请先阅读 [AGENTS.md](AGENTS.md)。

## 流程

1. 从 `main` 切分支：`feat/<简述>`、`fix/<简述>`、`chore/<简述>`、`docs/<简述>`。**一个功能一个分支、一个 PR。**
2. 本地准备：Node 24、pnpm 10.33.2，然后
   ```bash
   pnpm install --frozen-lockfile
   pnpm --filter zcode-cli build
   ```
3. 改动尽量放在新文件里，上游文件只做最小必要修改（见 AGENTS.md「最小化上游文件差异」）。
4. 提交前至少运行：
   - 类型检查：`cd apps/zcode-cli && ../../node_modules/.bin/turbo run typecheck`
   - 受影响包的测试：`pnpm --filter @zcode/<包名> test`
   - 不确定影响范围时：`pnpm test:ci`
5. 提 PR 到 `main`，描述中写清：
   - 改了什么、为什么；
   - 修改了哪些上游文件（Apache-2.0 修改声明）；
   - 验证结果（如实写，包括未执行的项）。

## 提交信息

使用 Conventional Commits：`feat: …`、`fix: …`、`chore: …`、`docs: …`、`test: …`。每个提交只做一件事。

## 不要做的事

- 不要直接修改或提交到 `upstream` 分支；它只由 `tools/sync-upstream.sh` 生成。
- 不要对上游文件做全量格式化、重命名或无关重构。
- 不要为了让 CI 通过往 `ci/known-failures.tsv` 加条目（规则见 AGENTS.md）。
- 不要提交凭据、真实用户数据或内部地址。

## 同步上游

由维护者执行，步骤见 [tools/README.md](tools/README.md)。
