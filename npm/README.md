# npm/

发布用的包描述（`@bssn520/zcode-cli-plus`），也是 release-please 的版本号来源。
不在 pnpm workspace 里，不影响构建；上游的 `apps/zcode-cli/packages/cli/package.json`（`@zcode/cli`，private）保持不动。

`node tools/prepare-npm-package.mjs` 会把构建产物 `apps/zcode-cli/packages/cli/dist/`、`packages/tui/dist`（到 `dist/tui/`）和许可证文件组装到 `.npm-package/`，并声明 TUI / playwright / koffi 等运行时依赖；再用 `tools/verify-npm-package.sh` 对 tarball 做全局安装 + TUI 冒烟后，在该目录 `npm publish`。

命令名只在这里的 `bin.zcp` 配置（可一处改名）；产物文件名仍是上游的 `zcode.cjs`。
