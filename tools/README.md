# tools/

| 文件 | 作用 |
| --- | --- |
| `sync-upstream.sh` | 从上游 `zai-org/ZCode` 检出里抽取 CLI 精简切片到目标仓库 |
| `derive-cli-lockfile.mjs` | 从根 `pnpm-lock.yaml` 派生 `apps/zcode-cli/pnpm-lock.yaml`（turbo 根） |
| `prepare-npm-package.mjs` | 组装发布目录 `.npm-package/`（读 `npm/package.json`）；改写 `dist/zcode.cjs` 注入发布版 `version` 与 `bin` 命令名；打包 `dist/tui/` 并改写 `@zcode/tui` 导入；审计裸模块依赖 |
| `verify-npm-package.sh` | 对 `.npm-package` 执行 `npm pack` → 临时 prefix 全局安装 → `zcp --version` → tmux/script 伪终端启动 TUI 冒烟 |
门禁脚本与已知失败清单在 `ci/`（fork 资产），不在本目录。

## 发布包 branding 注入

上游 CLI 构建（`apps/zcode-cli/packages/cli/scripts/build.mjs`）会把 `apps/zcode-cli/package.json` 的 version 写成 `__CLI_VERSION__`，命令名来自 `CLI_COMMAND_NAME = "zcode"`（`process-name.ts`）和 i18n help 文案。本地 `pnpm --filter zcode-cli build` 产物因此仍是上游的 `zcode` / 上游版本。

`prepare-npm-package.mjs` 在组装 `.npm-package/` 时，对复制后的 `dist/zcode.cjs` 做字面量替换（次数不匹配即抛错）：

- 把上游 version 的 3 处 `__CLI_VERSION__` 字面量换成 `npm/package.json` 的 version（`--version` + 两处 runtime 缓存目录）
- 把 `CLI_COMMAND_NAME`、help banner/usage、中英文 help 正文、子命令 `Usage: zcode …` 换成 `npm/package.json` 唯一的 `bin` 名（当前为 `zcp`）
- 跑一遍准备好的 bundle 的 `--version` / `--help` 做冒烟校验
- 把 `apps/zcode-cli/packages/tui/dist` 复制到发布包 `dist/tui/`（排除 `.map` / `.d.ts`），并把 `import("@zcode/tui")` 改写成基于 `__dirname` 的 `file:` URL
- 用 meriyah 扫描 `dist/zcode.cjs` 与 `dist/tui/index.js` 的裸模块导入，未在 `npm/package.json` dependencies 声明则失败

本地校验发布包（CI / `ci/run-ci-local.sh` 同样会跑）：

```bash
pnpm --filter zcode-cli build
node tools/prepare-npm-package.mjs .npm-package
bash tools/verify-npm-package.sh .npm-package
```

不改 `apps/` 源码，因此 `tools/sync-upstream.sh` 不受影响。若上游打包后的字面量形态变了，prepare 会失败，需按新产物更新替换模式。

## 同步上游新版本

```bash
git clone --depth 1 --branch <tag> https://github.com/zai-org/ZCode /tmp/ZCode
git checkout upstream
# 需要 Node 24 + pnpm 10.33.2 在 PATH 中；CI=true 避免测试写快照
CI=true tools/sync-upstream.sh /tmp/ZCode <tag> .
git add -A && git commit -m "sync: upstream ZCode <tag>"
# 再开 PR：upstream → dev（ci/、.github/、文档等只在 dev）
```

脚本幂等：受管路径（`apps/zcode-cli/`、6 个 `packages/*`、`third-party/`、`config/`、`patches/`、`scripts/`、测试引用的 `docs/*.md`、`schema-v1.ts`）先删后拷；根 `package.json`、`pnpm-workspace.yaml` 由脚本生成；`.gitignore` 例外用标记块写入或跳过（禁止裸 `>>`）；已提交的 lowering 快照在替换 `apps/zcode-cli` 时会被保留；`ci/`、`.github/`、根文档、`npm/`、`tools/` 等 fork 资产不动。最后用 `pnpm install --lockfile-only` 裁剪根 lock（`NO_LOCK=1` 跳过），再派生嵌套 lock。

抽取引起的问题一律改脚本修，不要在 `upstream` 分支手改。

升级 tag 后在 `dev` 上重新生成 `ci/known-failures.tsv`（见 `ci/collect-failures.sh`）。

## node-repl-host 的 `@modelcontextprotocol/sdk` patch

`tools/sync-upstream.sh`（约 109–111 行）在每次同步时，会给 `apps/zcode-cli/packages/node-repl-host/package.json` 加上 devDependency `@modelcontextprotocol/sdk@1.29.0`。

原因：`src/cua-bridge.ts` 直接 import 该包，上游完整仓库里它只通过 GUI 的 shadcn 依赖被 hoist；本切片去掉 GUI 后就会缺包。若改加到根 `package.json`，会触发 TS2589。

该改动由 sync 脚本每次重写，因此不会与上游同步产生冲突。
