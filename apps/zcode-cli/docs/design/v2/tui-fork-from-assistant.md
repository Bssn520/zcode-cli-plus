# TUI Fork From Assistant Reply

## Goal

Let users fork a child session from any completed assistant message id (`msg_…`) via the message action bar or `/fork msg…` slash forms. Original session stays intact and remains reachable with `/resume`.

## Semantic note (intentional vs GUI)

TUI uses legacy `forkFromCheckpoint({ targetMessageId })`, which **may roll back shared workspace files** changed after that reply when later checkpoints exist. Desktop GUI `forkAssistant` is conversation-only and does not touch the workspace. Help/confirm copy must say files may roll back; do not claim GUI-like “no workspace change.”

## Slash forms

| Input | Behavior |
|---|---|
| `/fork` / `/fork latest` / `/fork <checkpointId>` | Unchanged checkpoint fork. No new confirm. |
| `/fork msg` / `/fork message` | Assistant reply picker (`placement: "composer"`). Rows submit `/fork msg_<id>`. |
| `/fork msg_<id>` | Opens generic confirm selection. **Does not fork yet.** |
| `/fork msg_<id> --confirm` | Runs `forkApp({ targetMessageId })` → `forkFromCheckpoint({ targetMessageId })` → `replaceApp` to child. |
| `/fork msg_<id> --cancel` | No-op; response `Fork cancelled.`; no facade call. |

## Confirm (all message-id forks)

Always show a composer `TuiSelection` before forking (button path and slash path share this chain). No core preview/dry-run API.

- Title/prompt/help must warn that forking **may roll back workspace files** changed after this reply; original session is unaffected.
- Items: **Cancel** (default `selectedIndex`) then **Confirm fork**.
- Esc or Cancel → no `forkFromCheckpoint`.
- Confirm → one-shot `--confirm` command that calls fork.

## Wiring

- `packages/cli/src/command-center/fork-message.ts` — parse + picker + confirm helpers
- `packages/cli/src/command-center/create.ts` — `/fork` message branches
- `forkApp` / `forkFromCheckpoint` options: `{ targetCheckpointId?; targetMessageId? }`
- After `replaceApp` to the child, TUI glue calls the child's `setModel` with the parent session's current provider/model/reasoning (via `getCurrentModelOption` + `getThoughtLevel`). Legacy `forkWorkspaceFromCheckpoint` does not persist `modelSelectionEntry` the way stable GUI fork does; without this carry-over the child opens unbound ("Select a model before continuing").
- `packages/bootstrap/src/session-transcript.ts` — project `id` onto user+agent transcript messages (only allowed data-boundary change)

## /resume list (known gap outside TUI glue)

`/resume` picker data comes from `listSessionsForTui` → bootstrap `listZCodeSessions`, which hardcodes `roots: true` (`parent_id is null`). Legacy/stable forks set `parentID` on the child, so forked sessions are filtered out even though they already have a generated title (`Fork of …`). UI selection already knows how to render forks (`fork of <parent>`), but the list source never returns them. Fix requires bootstrap (or adapters list API) to allow non-root sessions for the TUI picker — not a core runtime change, and not doable in `packages/tui` / CLI TUI glue alone without re-implementing session-store listing.

## Busy

While the main session is busy/streaming, Fork is disabled in the action bar. Slash `/fork msg_<id> --confirm` still goes through command center (scriptable); the TUI entry points refuse activation while busy.

## Acceptance

1. `/fork msg` opens picker of agent messages with id; preview ~40 chars + time meta.
2. `/fork msg_<id>` opens confirm with Cancel default; Enter on default does not fork.
3. Confirm calls fork with `targetMessageId` only.
4. Cancel/Esc → no fork.
5. Checkpoint `/fork` / `latest` / id forms unchanged.
6. Transcript projection includes `id`.
7. After switching to the forked session, the child has the same model/provider/reasoning as the parent had at fork time (UI glue `setModel`, not a core change).
8. After fork, TUI clears the parent transcript and reloads the child history (`resetSessionProjection` + `restoredMessages`, same as `/resume`); `/fork …` / `--confirm` are not echoed as user rows.
9. CLI renames the child title to `[Fork] <原标题>` via `setCustomSessionTitle` after switch (core still creates `Fork of …`; do not edit `session-fork.ts`). Tip line: `已 Fork 到新会话：[Fork] <原标题>` — append with `responseFormat: "plain"` (OpenTUI markdown `shortcut_link` + conceal strips `[…]`; backslash escapes show literally).
