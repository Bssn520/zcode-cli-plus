# tools/

| 文件 | 作用 |
| --- | --- |
| `sync-upstream.sh` | 从上游 `zai-org/ZCode` 检出里抽取 CLI 精简切片到目标仓库 |
| `derive-cli-lockfile.mjs` | 从根 `pnpm-lock.yaml` 派生 `apps/zcode-cli/pnpm-lock.yaml`（turbo 根） |
| `prepare-npm-package.mjs` | 组装发布目录 `.npm-package/`（读 `npm/package.json`） |

门禁脚本与已知失败清单在 `ci/`（fork 资产），不在本目录。

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
