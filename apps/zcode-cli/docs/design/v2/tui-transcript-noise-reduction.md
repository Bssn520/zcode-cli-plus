# TUI Transcript Noise Reduction

## Goal

Make the main-session transcript quieter: hide plan/question tool chrome, collapse
work tools to one muted summary line, and attach Fork only under each turn's final
completed assistant text.

## Scope

- TUI presentation only (`packages/tui`, locale strings in `packages/i18n`).
- Do not change core tool execution, permission brokers, session-fork semantics, or
  model-visible history.

## Plan / question tools

Tools: `EnterPlanMode`, `ExitPlanMode`, `AskUserQuestion`.

- Never render the generic `Tool … pending/completed/failed` row or parameter /
  output previews (`questions: …`, `plan: …`, `output: …`).
- `EnterPlanMode`: render nothing.
- `AskUserQuestion` after completion: one muted hint
  `· 已回答：<answer summary>` / `· Answered: <answer summary>` when answers are
  available from restored JSON output or live result content.
- `ExitPlanMode`:
  - waiting (`pending` / `running`): `· 计划已提交，等待审批…`
  - approved (`completed`): `· 计划已批准`
  - rejected/failed: `✗` in danger color + muted `计划未批准`

## Work tools

All other tools (Bash / Edit / Write / Read / Grep / Glob / …):

- Default: one muted summary line with Thought-style `+` / `-` expand toggle.
- Examples: `· 运行 npm test ✓`, `· 修改 src/app.ts`, `· 读取 src/x.ts`.
- Running uses `…`; failure uses `✗` plus a short error; success uses `✓`.
- Expanded body reuses existing detail lines, result display, and truncated output.

## Fork placement

- Eligible only for completed agent messages that have assistant text and a
  persistent id (not streaming).
- Within each user→user turn, only the last such message is forkable.
- Render the action bar immediately under that message's last text part (or under
  content when there are no parts). Do not hang Fork under intermediate text or
  after trailing tool parts alone.

## Tests

- Plan/question tools are hidden or reduced to the hint lines above.
- Work tools render a collapsed one-line summary and keep details behind expand.
- Fork appears only on the turn-final completed assistant text message.
