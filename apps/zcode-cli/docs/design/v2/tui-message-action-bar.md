# TUI Message Action Bar

> Shortcut: **`Ctrl+Shift+F`** enters message action-bar focus mode. No existing binding conflict found; fallback would be `Ctrl+Shift+B` (Branch) if a terminal steals F.

## Goal

Every completed assistant reply that has a persistent `msg_…` id shows a muted action bar with **Fork**. Activating Fork starts the message-id fork confirm flow (see [`tui-fork-from-assistant.md`](./tui-fork-from-assistant.md)).

## Scope (P0)

- Fork button only (no Copy / feedback / Retry).
- Main session transcript only. Subagent read-only view does not show Fork.
- While `busy` / streaming: bar may still render, but Fork is greyed and disabled with a wait hint.
- Keyboard mode is explicit; Tab must not move focus between prompt and transcript.

## Interaction

| Input | Behavior |
|---|---|
| `Ctrl+Shift+F` | Enter action-bar mode; focus the last forkable completed agent row (viewport preference: newest). No candidates → status hint. Blocked while busy, approval, selection, or slash/model/mode/effort suggestion is open. |
| `↑` / `↓` | Move between forkable agent rows. |
| `←` / `→` or `Tab` / `Shift+Tab` | Move between buttons on the focused row (only Fork for now). |
| `Enter` | Activate the focused button. Fork submits `/fork msg_<id>` (opens confirm; does not fork yet). |
| `Esc` | Exit action-bar mode; focus returns to the prompt. |
| Mouse `onMouseUp` on Fork | Same as activating Fork; `stopPropagation`. Disabled while busy. |

## Visual

- Always-visible muted `[ Fork ]` under eligible agent rows.
- Focused row / button uses accent (e.g. `> [ Fork ]`).
- Disabled: muted + `disabledReason` / status “wait until current reply finishes”.

## Eligibility

Show Fork when:

- `message.role === "agent"`
- `message.id` is present (persistent `msg_…`)
- `message.streaming` is not true
- the message has assistant text (content or text parts)
- it is the last such completed agent message in the current user turn
- not in subagent read-only view

Render the bar under that message's last text part (or content when there are no
parts), not under trailing tool-only tails or intermediate text.

Global busy disables activation even for historical completed rows.

## Wiring

- `packages/tui/src/app-message-actions.tsx` — bar render + mouse
- `packages/tui/src/app-message-actions-keyboard.ts` — focus mode state helpers
- `MessageRow` / `ContentPane` / `app-keyboard.ts` / `app.tsx` — thin wiring only

## Acceptance

1. Only each turn's final completed agent text row with id shows `[ Fork ]`.
2. Streaming / missing id / subagent view: no active Fork.
3. Busy: Fork greyed; Enter/click does not submit.
4. Keyboard mode enter/move/activate/Esc works as above.
5. Activating Fork opens the generic rollback warning confirm (Cancel default), not an immediate fork.
