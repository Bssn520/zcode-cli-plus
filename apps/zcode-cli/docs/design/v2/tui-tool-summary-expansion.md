# TUI Work-Tool Summary Expansion

> Shortcut: **`Ctrl+E`** toggles expand/collapse for **all** work-tool summary rows (`+ · run … ✓`). OpenTUI textarea already binds bare `Ctrl+E` to `line-end`, so this chord is claimed only when the prompt draft is empty.

## Goal

Work-tool rows collapse to one muted summary line and currently expand only via mouse `onMouseUp` on the `+`/`-` marker. Add a keyboard path that does not require pointing.

## Interaction

| Input | Behavior |
|---|---|
| `Ctrl+E` | Toggle every work-tool summary row (expand all ↔ collapse all). |
| Draft non-empty | Ignore — keep textarea `line-end`. |
| No work-tool summary rows | Ignore — keep textarea `line-end`. |
| Approval / selection / read-only modes | Unchanged; those handlers still win first. |

`+/-` stay owned by workflow cards (`workflowExpansionActionFor`). Tool rows keep mouse toggle.

## Scope

- All work-tool summaries in the main transcript (not “latest turn only”).
- Plan/question quiet rows (`EnterPlanMode` / `AskUserQuestion` / `ExitPlanMode`) are not summary rows and are ignored.
- Subagent read-only view is unchanged (no new binding there).

## Wiring

- `packages/tui/src/app-tool-expansion.ts` — hotkey gate, summary detection, expand broadcast
- `packages/tui/src/app-tool-components.tsx` — subscribe local row state to broadcast
- `packages/tui/src/app-keyboard.ts` — thin claim + status
- `@zcode/i18n` transcript.tools status/hint copy

## Acceptance

1. Empty draft + at least one work-tool summary: `Ctrl+E` expands all; second press collapses all.
2. Non-empty draft: `Ctrl+E` still moves the caret to line-end (not claimed).
3. Mouse `+`/`-` on a single row still toggles that row.
4. No conflict with existing Ctrl bindings (`C`/`Y`/`R`/`U`/`V`/`O`, `Ctrl+X` sidebar, `Ctrl+Shift+F` message actions) or bare `+/-` workflow expansion.
