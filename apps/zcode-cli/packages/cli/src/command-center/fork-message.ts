import type { TuiSelection, TuiSelectionItem, TuiSubmitPromptResult } from "@zcode/tui";
import { formatForkSwitchResult } from "./formatters.js";
import type { CommandCenterDeps, CommandCenterForkResult } from "./types.js";
import { formatTime, shortId, shortText } from "./utils.js";

const COMPOSER_SELECTION_PLACEMENT = "composer";
const MESSAGE_PREVIEW_LENGTH = 40;

export type ForkTranscriptMessage = {
  content: string;
  id?: string;
  parts?: ReadonlyArray<{
    input?: Record<string, unknown>;
    toolName?: string;
    type: string;
  }>;
  role: "agent" | "user" | string;
};

export type ParsedForkTarget =
  | { kind: "message-picker" }
  | { kind: "message"; messageId: string; confirmed: boolean; cancelled: boolean }
  | { kind: "checkpoint"; checkpointId?: string };

export function parseForkTarget(args: string): ParsedForkTarget {
  const tokens = args
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);
  if (tokens.length === 0 || tokens[0] === "latest") {
    return { kind: "checkpoint", checkpointId: undefined };
  }

  const head = tokens[0]!;
  const lowered = head.toLowerCase();
  if (lowered === "msg" || lowered === "message") {
    return { kind: "message-picker" };
  }

  if (head.startsWith("msg_")) {
    const flags = new Set(tokens.slice(1).map((token) => token.toLowerCase()));
    return {
      kind: "message",
      messageId: head,
      cancelled: flags.has("--cancel") || flags.has("cancel"),
      confirmed: flags.has("--confirm") || flags.has("confirm"),
    };
  }

  return { kind: "checkpoint", checkpointId: head };
}

export function buildAssistantMessageSelection(
  messages: readonly ForkTranscriptMessage[],
): TuiSelection {
  const items = messages
    .filter((message): message is ForkTranscriptMessage & { id: string } =>
      Boolean(message.role === "agent" && message.id),
    )
    .reverse()
    .map(assistantMessageToSelectionItem);

  return {
    emptyMessage: "No assistant replies are available to fork from.",
    help: "Type to filter, Up/Down choose, Enter opens confirm, Esc cancels",
    items,
    placement: COMPOSER_SELECTION_PLACEMENT,
    prompt: "Choose an assistant reply to fork from.",
    title: "Fork From Assistant Reply",
  };
}

/** Always-on generic confirm: forking may roll back workspace files. Cancel is default. */
export function buildForkConfirmSelection(messageId: string): TuiSelection {
  return {
    emptyMessage: "No fork confirmation actions are available.",
    help: "Up/Down choose, Enter runs the choice, Esc cancels",
    items: [
      {
        command: `/fork ${messageId} --cancel`,
        id: "fork-cancel",
        keywords: ["cancel"],
        meta: "Original session unchanged",
        primary: "Cancel",
        secondary: "Do not fork",
      },
      {
        command: `/fork ${messageId} --confirm`,
        id: "fork-confirm",
        keywords: ["confirm", "fork", "rollback"],
        meta: "May roll back workspace files",
        primary: "Confirm fork",
        secondary: "Files changed after this reply may roll back; original session stays intact",
      },
    ],
    placement: COMPOSER_SELECTION_PLACEMENT,
    prompt:
      "Forking may roll back workspace files changed after this reply. The original session stays intact.",
    selectedIndex: 0,
    title: "Confirm Fork",
  };
}

export function timestampFromMessageId(messageId: string): number | undefined {
  const match = /^msg_([0-9a-z]+)_/i.exec(messageId);
  if (!match?.[1]) {
    return undefined;
  }
  const timestamp = Number.parseInt(match[1], 36);
  // Date.now() 量级，排除测试用短 id。
  if (!Number.isFinite(timestamp) || timestamp < 1_000_000_000_000) {
    return undefined;
  }
  return timestamp;
}

function assistantMessageToSelectionItem(
  message: ForkTranscriptMessage & { id: string },
): TuiSelectionItem {
  const timestamp = timestampFromMessageId(message.id);
  const preview = shortText(
    message.content || toolPreview(message) || "(empty reply)",
    MESSAGE_PREVIEW_LENGTH,
  );
  return {
    command: `/fork ${message.id}`,
    id: message.id,
    keywords: [message.id, message.content],
    meta: timestamp === undefined ? undefined : formatTime(timestamp),
    primary: preview,
    secondary: shortId(message.id),
  };
}

function toolPreview(message: ForkTranscriptMessage): string {
  const toolNames = (message.parts ?? [])
    .filter((part) => part.type === "tool")
    .map((part) => part.toolName)
    .filter((name): name is string => Boolean(name));
  if (toolNames.length === 0) {
    return "";
  }
  return `tools: ${toolNames.join(", ")}`;
}


export async function buildForkSwitchResult(
  deps: CommandCenterDeps,
  result: CommandCenterForkResult,
): Promise<TuiSubmitPromptResult> {
  const app = await deps.getApp();
  const restoredMessages = app.loadSessionTranscript
    ? await app.loadSessionTranscript()
    : undefined;
  return {
    mode: deps.getMode?.(),
    locale: app.getLocale?.(),
    model: app.getModel?.(),
    theme: app.getTheme?.(),
    ...(restoredMessages !== undefined
      ? {
          resetSessionProjection: true,
          restoredMessages,
        }
      : { resetSessionProjection: true }),
    response: formatForkSwitchResult(result),
    // [Fork] 是 Markdown shortcut_link；conceal 会吃掉方括号，tip 必须 plain
    responseFormat: "plain",
    thoughtLevel: app.getThoughtLevel?.(),
    traceId: undefined,
  };
}
