# zcode-cli-plus

> **社区维护的非官方分支。** 本项目基于 [zai-org/ZCode](https://github.com/zai-org/ZCode) 的开源 CLI（`apps/zcode-cli`）构建，**不是 Z.AI / 智谱官方产品**，与 Z.AI 没有隶属或背书关系。"ZCode" 名称归其权利人所有。

## 这是什么

- 只包含 ZCode 的终端 CLI / TUI 部分，不包含桌面端、Web、移动端。
- 在上游基础上增加社区需要的功能，计划中的第一批：
  - 在任意一条 AI 回复处 fork 会话；
  - Plan 模式下审批前可完整预览计划，并可附修改意见拒绝。
- 定期跟进上游 tag（当前：见 [`UPSTREAM_TAG`](UPSTREAM_TAG)）。

## 0.2.1 新功能

### AskUserQuestion

- 选完选项后直接提交，不再多一步确认。

### 计划审批

- 简化为「批准」按钮 + 修改意见输入框。
- `Tab` / `↑↓` 在按钮与输入框间切换；输入框回车发送反馈，agent 改计划后重新弹出审批；`Esc` 拒绝。

### 对话降噪

- 隐藏计划 / 提问工具行。
- 工作工具折叠为一行摘要，可展开查看详情。

### Fork 会话

- Fork 后自动切换并重绘到新会话；标题为 `[Fork] 原标题`。

### 命令与快捷键

- `zcp update`（支持 `--check`）。
- `/quit`、`/q` 退出。
- 修复输入框发送后不清空，以及 `Ctrl+U`。

### 其他修复

- kitty 缩略图闪烁修复。
- 未配置模型时，`--json` / json 输出错误改为合法 JSON。
- `--no-session` 不再写入 rollout 日志。

## 0.2.0 新功能

### 图片输入

- 拖入 / 粘贴图片路径，草稿中用 `@path` 引用图片。
- `Ctrl+V` 粘贴剪贴板图片；`Ctrl+O` 用系统查看器打开最后一个图片附件。
- Headless：`zcp -p "describe" --attach img.png`（可重复）。
- 附件条显示文件名 + 尺寸 + 大小；协议：`ZCP_IMAGE_PROTOCOL=kitty|iterm|none`。

**重要：** 自定义模型只有在 `provider_config.json` 中该模型标记 `inputFormat.supportsImage: true` 时才会收到图片，否则图片不会发送。示例：

```json
{
  "schemaVersion": 1,
  "config": {
    "modelConfigRules": {
      "providerModelRules": [
        {
          "providerId": "my-provider",
          "modelId": "my-vision-model",
          "config": {
            "properties": {
              "inputFormat": { "supportsImage": true }
            }
          }
        }
      ],
      "manualProviderModelRules": []
    }
  }
}
```

### Headless 参数（PR #27）

- `-p` / `--prompt`；stdin 拼接：`echo x | zcp -p '...'`
- `--output-format text|json|stream-json` / `--json`
- `--model <provider/model>`
- `--timeout <seconds>`（超时退出码 `2`）
- `--no-session`（不写会话记录；与 `--resume` / `-c` 互斥）
- 退出码：`0` 成功 / `1` 错误 / `2` 超时

### 计划预览

完整 Markdown 预览（shiki 代码高亮、GFM 表格、Mermaid 内置离线在浏览器打开）。

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

### What's new in 0.2.1

**AskUserQuestion**

- Selecting an option submits immediately (no extra confirm step).

**Plan approval**

- Simplified to an Approve button + revision feedback input.
- `Tab` / `↑↓` switch between button and input; Enter in the input sends feedback so the agent revises the plan and reopens approval; `Esc` rejects.

**Quieter chat**

- Hide plan / question tool rows.
- Collapse work tools to a one-line summary that can be expanded.

**Fork session**

- After fork, auto-switch and redraw into the new session; title becomes `[Fork] original title`.

**Commands & shortcuts**

- `zcp update` (with `--check`).
- `/quit`, `/q` to exit.
- Fix draft not clearing after send, and `Ctrl+U`.

**Other fixes**

- Fix kitty thumbnail flicker.
- When no model is configured, `--json` / json output errors are valid JSON.
- `--no-session` no longer writes rollout logs.

### What's new in 0.2.0

**Image input**

- Drag/paste image paths; reference images in the draft with `@path`.
- `Ctrl+V` paste clipboard image; `Ctrl+O` open the last image attachment in the system viewer.
- Headless: `zcp -p "describe" --attach img.png` (repeatable).
- Attachment bar shows filename + dimensions + size; protocol: `ZCP_IMAGE_PROTOCOL=kitty|iterm|none`.

**Important:** custom models only receive images when `provider_config.json` marks that model with `inputFormat.supportsImage: true`; otherwise images are not sent. Example:

```json
{
  "schemaVersion": 1,
  "config": {
    "modelConfigRules": {
      "providerModelRules": [
        {
          "providerId": "my-provider",
          "modelId": "my-vision-model",
          "config": {
            "properties": {
              "inputFormat": { "supportsImage": true }
            }
          }
        }
      ],
      "manualProviderModelRules": []
    }
  }
}
```

**Headless flags (PR #27)**

- `-p` / `--prompt`; stdin concat: `echo x | zcp -p '...'`
- `--output-format text|json|stream-json` / `--json`
- `--model <provider/model>`
- `--timeout <seconds>` (timeout exit code `2`)
- `--no-session` (no session write; mutually exclusive with `--resume` / `-c`)
- Exit codes: `0` success / `1` error / `2` timeout

**Plan preview**

Full Markdown preview (shiki highlighting, GFM tables, built-in offline Mermaid opened in the browser).
