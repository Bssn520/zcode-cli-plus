# TUI Plan Approval

## 目标

`ExitPlanMode` 审批在 TUI 中只展示完整计划正文，并提供批准与修改意见两条路径；不引入步骤列表、外部编辑器或评论审阅子模式。

## 行为

- 面板主体：已有 Markdown 渲染展示 `plan` 全文（含代码高亮、表格；含 mermaid 时可按 `o` 打开预览）。
- 预览可滚动：`PgUp` / `PgDn` 翻页；`↑` / `↓` 不滚动预览，只在底部控件间切换焦点。
- 底部仅两项：
  - 「批准」按钮（默认焦点）
  - 修改意见输入框（占位：输入修改意见，回车发送给 agent 重新出计划…）
- 焦点：`Tab` / `↑` / `↓` 在批准与输入框间切换。
- `Enter`：
  - 焦点在批准：批准并退出 plan mode（现有 allow / modify 结算路径；当前 TUI 不再提供就地改 plan，因此走 allow）。
  - 焦点在输入框：非空文本以 `deny + reasonSource=plan_approval_feedback` 发回（保持 plan mode，等待 agent 改计划后再弹）；空输入无操作，绝不批准。
- `Esc`：拒绝审批（普通 deny）；不在按钮或提示行展示。
- 提示行仅保留：`PgUp/PgDn` 滚动；计划含 mermaid 时追加 `o` 打开 Mermaid。
- 去掉入口：`Ctrl+G` 编辑、`f` 步骤意见、`g` 整体意见、`r` review。
- 再次弹出（新的 `ExitPlanMode` permission request）时，通过 `createPlanApprovalState` 重置焦点、输入框与滚动位置。

## 文案

中英文走 `@zcode/i18n` 的 `tui.planApproval`；TUI 渲染需传入当前 locale 的 `copy`。

## 非目标

- 不改 core / bootstrap / adapters 的 ExitPlanMode 结算语义。
- 不恢复步骤解析 UI；`parsePlanPreview` 可保留给其它用途，但审批面板不再依赖。
