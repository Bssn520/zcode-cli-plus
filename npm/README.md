# npm/

发布用的包描述（`@bssn520/zcode-cli-plus`），也是 release-please 的版本号来源。
不在 pnpm workspace 里，不影响构建；上游的 `apps/zcode-cli/packages/cli/package.json`（`@zcode/cli`，private）保持不动。

`node tools/prepare-npm-package.mjs` 会把构建产物 `apps/zcode-cli/packages/cli/dist/` 和许可证文件组装到 `.npm-package/`，再在该目录 `npm publish`。

命令名只在这里的 `bin.zcp` 配置（可一处改名）；产物文件名仍是上游的 `zcode.cjs`。
