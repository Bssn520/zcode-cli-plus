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
- `packages/bootstrap/src/session-transcript.ts` — project `id` onto user+agent transcript messages (only allowed data-boundary change)

## Busy

While the main session is busy/streaming, Fork is disabled in the action bar. Slash `/fork msg_<id> --confirm` still goes through command center (scriptable); the TUI entry points refuse activation while busy.

## Acceptance

1. `/fork msg` opens picker of agent messages with id; preview ~40 chars + time meta.
2. `/fork msg_<id>` opens confirm with Cancel default; Enter on default does not fork.
3. Confirm calls fork with `targetMessageId` only.
4. Cancel/Esc → no fork.
5. Checkpoint `/fork` / `latest` / id forms unchanged.
6. Transcript projection includes `id`.
