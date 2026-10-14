# tools/

| 文件 | 作用 |
| --- | --- |
| `sync-upstream.sh` | 从上游 `zai-org/ZCode` 检出里抽取 CLI 精简切片到目标仓库 |
| `collect-failures.sh` | 跑全部 CLI 包测试，输出失败列表（`包<TAB>文件<TAB>用例名`） |
| `test-known-failures.sh` | CI 闸门源文件；同步时复制到 `ci/` |
| `known-failures.tsv` | 当前上游 tag 的已知失败清单源文件；同步时复制到 `ci/` |

## 同步上游新版本

```bash
git clone --depth 1 --branch <tag> https://github.com/zai-org/ZCode /tmp/ZCode
git checkout upstream
CI=true tools/sync-upstream.sh /tmp/ZCode <tag> .   # 需要 Node 24 + pnpm 10.33.2 在 PATH 中
git add -A && git commit -m "sync: upstream ZCode <tag>"
git checkout main && git merge upstream             # 冲突只会出现在我们改过的文件
```

脚本是幂等的：受管路径（`apps/zcode-cli/`、6 个 `packages/*`、`third-party/`、`config/`、`patches/`、`scripts/`、测试引用的 `docs/*.md` 等）先删后拷；根 `package.json`、`pnpm-workspace.yaml` 由脚本生成；最后用 `pnpm install --lockfile-only` 把上游 lockfile 裁剪到 CLI 范围（`NO_LOCK=1` 跳过）。
抽取引起的问题一律改脚本修，不要在 `upstream` 分支手改。

升级 tag 后要重新生成已知失败清单：分别在精简仓库和完整上游里跑 `collect-failures.sh`，确认精简仓库没有多出失败，再更新 `known-failures.tsv`。
