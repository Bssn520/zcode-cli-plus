# zcode-cli-plus

> **社区维护的非官方分支。** 本项目基于 [zai-org/ZCode](https://github.com/zai-org/ZCode) 的开源 CLI（`apps/zcode-cli`）构建，**不是 Z.AI / 智谱官方产品**，与 Z.AI 没有隶属或背书关系。"ZCode" 名称归其权利人所有。

## 这是什么

- 只包含 ZCode 的终端 CLI / TUI 部分，不包含桌面端、Web、移动端。
- 在上游基础上增加社区需要的功能，计划中的第一批：
  - 在任意一条 AI 回复处 fork 会话；
  - Plan 模式下审批前可完整预览计划，并可附修改意见拒绝。
- 定期跟进上游 tag（当前：见 [`UPSTREAM_TAG`](UPSTREAM_TAG)）。

## 安装

```bash
npm i -g @bssn520/zcode-cli-plus
zcp --version
```

为避免和官方 `zcode` 命令冲突，发布包命令名为 **`zcp`**（上游构建产物文件名仍是 `zcode.cjs`）。

## 从源码构建

需要 Node 24、pnpm 10.33.2：

```bash
pnpm install --frozen-lockfile
pnpm --filter zcode-cli build
node apps/zcode-cli/packages/cli/dist/zcode.cjs --help
```

开发规范见 [AGENTS.md](AGENTS.md)，贡献流程见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

[Apache-2.0](LICENSE)。保留上游的 [NOTICE.md](NOTICE.md)、[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) 和 `third-party/`；对上游文件的修改在对应 PR 中注明。

---

## English

**zcode-cli-plus** is a community-maintained, **unofficial** fork of the open-source CLI from [zai-org/ZCode](https://github.com/zai-org/ZCode). It is **not an official Z.AI product** and is not affiliated with or endorsed by Z.AI.

- CLI/TUI only (no desktop, web or mobile apps); tracks upstream tags (see `UPSTREAM_TAG`).
- npm package: `@bssn520/zcode-cli-plus`; command name: `zcp`.
- Build: Node 24 + pnpm 10.33.2, `pnpm install --frozen-lockfile && pnpm --filter zcode-cli build`.
- License: Apache-2.0, with upstream NOTICE and third-party notices preserved.
