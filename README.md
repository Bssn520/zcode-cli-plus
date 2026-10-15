# zcode-cli-plus

社区维护的非官方 ZCode CLI / TUI（命令 `zcp`）。基于 [zai-org/ZCode](https://github.com/zai-org/ZCode) 开源 CLI 切片，**不是 Z.AI / 智谱官方产品**。

[![npm](https://img.shields.io/npm/v/@bssn520/zcode-cli-plus.svg)](https://www.npmjs.com/package/@bssn520/zcode-cli-plus)
[![Node](https://img.shields.io/node/v/@bssn520/zcode-cli-plus.svg)](https://www.npmjs.com/package/@bssn520/zcode-cli-plus)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

当前发布版本：**0.2.1** · 上游跟踪：见 [`UPSTREAM_TAG`](UPSTREAM_TAG)（现为 `v3.15.1`）

## 特性一览

- 全屏 TUI 对话；斜杠命令与权限模式（`build` / `edit` / `plan` / `yolo` / `guarded`）
- Plan 审批：Markdown 预览、意见反馈、含 Mermaid 时可浏览器打开
- AskUserQuestion：选选项后直接提交
- 对话降噪：计划 / 提问工具行隐藏；工作工具折叠为一行摘要，可展开
- 从 AI 最终回复 Fork 会话，标题为 `[Fork] 原标题`，并自动切入新会话
- 图片输入：路径 / `@path` / 剪贴板粘贴；kitty / iTerm2 缩略图
- Headless 脚本：`-p`、`--no-session`、`--timeout`、`--output-format`、`--attach`、stdin 管道
- `zcp update` 自检并全局更新 npm 包

## 安装

需要 **Node ≥ 24**（`npm/package.json` → `engines.node`）。

```bash
npm i -g @bssn520/zcode-cli-plus
zcp --version   # 0.2.1
```

发布包命令名为 **`zcp`**（避免与官方 `zcode` 冲突；构建产物文件名仍是 `zcode.cjs`）。

## 快速开始

1. 登录官方 Coding Plan（浏览器授权）：

   ```bash
   zcp login zai        # 或 bigmodel
   # TUI 内也可用 /login
   ```

2. 或自定义 provider：编辑 `~/.zcode/v2/provider_config.json`，再在 TUI 用 `/model` 切换。图片能力需按下方「图片输入」标记 `supportsImage`。

3. 打开 TUI：

   ```bash
   zcp
   # 或
   zcp tui
   ```

## TUI 快捷键与常用斜杠命令

| 按键 / 命令 | 行为 |
| --- | --- |
| `Ctrl+O` | 用系统查看器打开最后一个图片附件 |
| `Ctrl+V`（或 `Meta+V`） | 从剪贴板粘贴图片到附件 |
| `Ctrl+E` | 展开 / 折叠全部工作工具摘要（**仅输入框为空**且存在摘要时） |
| `Ctrl+U` | 清空输入框与附件 |
| `Shift+Tab` | 切换权限模式 |
| `Ctrl+C` | 有草稿时先清空；空草稿时需连按两次退出 |
| `Esc` | 审批中：拒绝计划 / 拒绝提问；否则关闭建议列表或中止当前输出 |
| `PgUp` / `PgDn` | 计划预览滚动 |
| `o` | 计划含 Mermaid 时，在浏览器打开预览（浏览焦点下） |
| `Tab` / `↑` / `↓` | 计划审批区：在「批准」与「修改意见」间切换 |
| `Enter`（计划审批） | 焦点在「批准」→ 批准；焦点在意见框且非空 → 发送反馈让 agent 改计划并重新审批 |
| Fork 按钮 | 仅挂在每个 user turn 的 **AI 最终回复**下；确认后自动切到标题为 `[Fork] 原标题` 的新会话 |
| `/q` · `/quit` | 退出 TUI（与连按两次 `Ctrl+C` 同清理路径） |
| `/new` | 新会话 |
| `/resume [sessionId]` | 恢复会话；省略 id 则取当前目录最近一次 |
| `/fork …` | 从 checkpoint 或助手回复 Fork |
| `/mode [mode]` | 查看 / 切换权限模式 |
| `/model [id]` | 查看 / 切换模型 |
| `/login` · `/logout` | 登录 / 登出 |

完整斜杠列表见 `zcp --help`（另有 `/help`、`/compact`、`/mcp`、`/skill`、`/goal` 等）。`/quit` 在 TUI `/help` 中有说明。

## 无 session / 脚本模式

适合 CI 与管道。常用参数：

| 参数 | 说明 |
| --- | --- |
| `-p` / `--prompt <text>` | 单次提示，不打开 TUI |
| `--no-session` | 使用临时 SQLite，结束删除；并设置 `ZCODE_DISABLE_MODEL_IO_RECORD=1`，不写 rollout / model-io 日志。与 `--resume` / `-c` 互斥 |
| `--timeout <seconds>` | 超时 abort，退出码 `2` |
| `--model <provider/model>` | 仅本次覆盖模型 |
| `--output-format text\|json\|stream-json` | 默认 `text`；`--json` 仍可用（显式 `--output-format` 优先） |
| `--attach <path>` | 附加本地文件；可重复 |
| stdin 管道 | 非 TTY stdin 与 `-p` 拼接为 `stdin\n\nprompt`，最大 **10MB** |

退出码：

| 码 | 含义 |
| --- | --- |
| `0` | 成功 |
| `1` | 出错 |
| `2` | `--timeout` 超时 |

示例：

```bash
zcp -p "总结这个 diff" --no-session --timeout 120 --output-format json
echo "上下文" | zcp -p "据此回答" --no-session
zcp -p "描述图片" --attach ./shot.png --output-format text
```

未配置模型且使用 json 输出时，错误写到 **stdout**（合法 JSON），退出码 `1`，例如：

```json
{
  "type": "result",
  "subtype": "error",
  "is_error": true,
  "error": "Model creation failed",
  "traceId": "…"
}
```

`stream-json` 时为同一对象的单行 JSON。

## 图片输入

- TUI：拖入 / 粘贴图片路径；草稿中用 `@path` 引用；`Ctrl+V` 粘贴剪贴板图片；`Ctrl+O` 打开最后一张
- Headless：`zcp -p "describe" --attach img.png`（可重复）
- 附件条显示文件名、尺寸、大小；终端协议由环境变量控制：

```bash
# kitty | iterm | none（也可依赖 TERM / TERM_PROGRAM 自动检测）
export ZCP_IMAGE_PROTOCOL=kitty
```

kitty / iTerm2（及 WezTerm 走 iterm 协议）可显示缩略图。

**自定义模型**只有在 `~/.zcode/v2/provider_config.json` 里为该模型打开 `inputFormat.supportsImage: true` 时才会真正收到图片，否则图片不会发送：

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

## `zcp update`

```bash
zcp update          # 检查并全局安装最新版
zcp update --check  # 只检查
```

- 默认 registry：`https://registry.npmjs.org`
- 可用 `ZCP_UPDATE_REGISTRY` 覆盖
- 失败时会打印手动命令，例如：`npm i -g @bssn520/zcode-cli-plus@latest`（必要时提示 `sudo`）

## 和上游的关系

- 本仓库是 [zai-org/ZCode](https://github.com/zai-org/ZCode) 的 **CLI 精简分支**（`apps/zcode-cli/` + 依赖根包），跟踪 tag 见 [`UPSTREAM_TAG`](UPSTREAM_TAG)。
- 社区改动集中在 **UI / TUI / CLI 层**；不改 harness、提示词、agent loop、模型调用主路径。
- 相对上游源码（除 TUI / CLI / i18n 外）的已知改动，同步上游有冲突时优先检查这三处：
  1. `apps/zcode-cli/packages/adapters/src/model/runner-debug.ts`：`shouldRecordModelIO` 读取 `ZCODE_DISABLE_MODEL_IO_RECORD=1`（`--no-session` 时由 CLI 设置）
  2. `apps/zcode-cli/packages/bootstrap/src/session-transcript.ts`：transcript 投影追加可选消息 id（供 TUI 从消息 Fork 锚定，不影响 agent / 提示词）
  3. `apps/zcode-cli/packages/node-repl-host/package.json`：增加 `@modelcontextprotocol/sdk` `1.29.0`（打包依赖）
- 上游同步脚本：[`tools/sync-upstream.sh`](tools/sync-upstream.sh)（说明见 [`tools/README.md`](tools/README.md)）。`upstream` 分支只能由该脚本生成，禁止手改。
- 保留上游 [`NOTICE.md`](NOTICE.md)、[`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md) 与 `third-party/`；对上游文件的修改在对应 PR 中按 Apache-2.0 第 4(b) 条注明。

## 开发与发版

| 步骤 | 说明 |
| --- | --- |
| 功能 PR | 从 `dev` 开 `feat/…` / `fix/…` 等分支，PR 回 **`dev`** |
| 发布 | 维护者 PR **`dev → main`**（merge commit）；release-please 在 `main` 上发 npm |
| 版本源 | `npm/package.json` 与 `.release-please-manifest.json` 的 `npm` 字段必须一致（现均为 `0.2.1`） |

本地构建与发布包校验：

```bash
pnpm install --frozen-lockfile
pnpm --filter zcode-cli build
node tools/prepare-npm-package.mjs .npm-package
bash tools/verify-npm-package.sh .npm-package
```

其它常用命令：`pnpm lint`、`pnpm test:ci`、`pnpm ci:local`。  
CI 对上游已知失败的门禁清单：[`ci/known-failures.tsv`](ci/known-failures.tsv)（状态：`fail` / `flaky` / `ci-env`）。不要为了变绿随意加条目。

开发规范见 [`AGENTS.md`](AGENTS.md)，贡献流程见 [`CONTRIBUTING.md`](CONTRIBUTING.md)。

## License

[Apache-2.0](LICENSE)。详见 [`LICENSE`](LICENSE)、[`NOTICE.md`](NOTICE.md)、[`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md)。

---

**English:** Community-maintained unofficial fork of the ZCode CLI/TUI. Package `@bssn520/zcode-cli-plus`, command `zcp`, Node ≥ 24, Apache-2.0. Not affiliated with or endorsed by Z.AI.
