import React from "react";
import type { TuiCopy } from "@zcode/i18n";
import type { Message } from "./app-model.js";
import { palette } from "./app-model.js";
import { EmptyTranscriptLogo } from "./app-empty-transcript.js";
import { DEFAULT_TUI_COPY } from "./app-locale.js";
import { MarkdownText } from "./app-markdown.js";
import {
  MessageActionBar,
  shouldRenderMessageActionBar,
} from "./app-message-actions.js";
import {
  lastTextPartIndex,
  type MessageActionsFocusState,
} from "./app-message-actions-keyboard.js";
import { ThoughtTranscriptPartView } from "./app-thought-components.js";
import { ToolTranscriptPartView } from "./app-tool-components.js";
import { WorkflowRunCardView } from "./app-workflow-card.js";
import type { TuiWorkflowCard } from "./app-workflow-mirror.js";
const h = React.createElement as (
  type: React.ElementType | string,
  props?: Record<string, unknown> | null,
  ...children: React.ReactNode[]
) => React.ReactElement;

const USER_MESSAGE_VERTICAL_PADDING = 1;

export function ContentPane({
  animateEmptyLogo = false,
  busy = false,
  copy = DEFAULT_TUI_COPY,
  expandedWorkflowRunIds,
  emptyText,
  id,
  focused,
  messageActionsFocus,
  messages,
  onForkMessage,
  showMessageActions = false,
  terminalWidth = 100,
  workflowCardsByToolCallId,
}: {
  animateEmptyLogo?: boolean;
  busy?: boolean;
  copy?: TuiCopy;
  expandedWorkflowRunIds?: ReadonlySet<string>;
  emptyText?: string;
  id?: string;
  focused: boolean;
  messageActionsFocus?: MessageActionsFocusState;
  messages: Message[];
  onForkMessage?: (messageId: string) => void;
  showMessageActions?: boolean;
  terminalWidth?: number;
  workflowCardsByToolCallId?: ReadonlyMap<string, TuiWorkflowCard>;
}): React.ReactElement {
  return h(
    "scrollbox",
    {
      id,
      focused,
      stickyScroll: true,
      stickyStart: "bottom",
      viewportCulling: true,
      style: {
        backgroundColor: palette.background,
        border: false,
        flexGrow: 1,
        marginBottom: 1,
        minHeight: 8,
        contentOptions: {
          backgroundColor: palette.background,
          flexDirection: "column",
          padding: 1,
        },
        rootOptions: {
          backgroundColor: palette.background,
        },
        scrollbarOptions: {
          showArrows: true,
        },
        viewportOptions: {
          backgroundColor: palette.background,
        },
        wrapperOptions: {
          backgroundColor: palette.background,
        },
      },
    },
    ...(messages.length === 0
      ? [
          emptyText
            ? h("text", { key: "empty", style: { fg: palette.muted } }, emptyText)
            : h(EmptyTranscriptLogo, { animated: animateEmptyLogo, key: "empty-transcript-logo" }),
        ]
      : messages.map((message, index) =>
          h(MessageRow, {
            busy,
            copy,
            expandedWorkflowRunIds,
            index,
            key: `${index}-${message.role}`,
            message,
            messageActionsFocus:
              messageActionsFocus?.messageIndex === index ? messageActionsFocus : undefined,
            messages,
            onForkMessage,
            showMessageActions,
            terminalWidth,
            workflowCardsByToolCallId,
          }),
        )),
  );
}

export function MessageRow({
  busy = false,
  copy = DEFAULT_TUI_COPY,
  expandedWorkflowRunIds,
  index,
  message,
  messageActionsFocus,
  messages,
  onForkMessage,
  showMessageActions = false,
  terminalWidth = 100,
  workflowCardsByToolCallId,
}: {
  busy?: boolean;
  copy?: TuiCopy;
  expandedWorkflowRunIds?: ReadonlySet<string>;
  index: number;
  message: Message;
  messageActionsFocus?: MessageActionsFocusState;
  messages?: Message[];
  onForkMessage?: (messageId: string) => void;
  showMessageActions?: boolean;
  terminalWidth?: number;
  workflowCardsByToolCallId?: ReadonlyMap<string, TuiWorkflowCard>;
}): React.ReactElement {
  const parts = message.parts ?? [];
  if (message.role === "timeline") {
    return h(CompactTimelineRow, { copy, message, terminalWidth });
  }
  // speaker labels were visually noisy; only user prompts carry row chrome.
  const isUserMessage = message.role === "user";
  const rowBackground = isUserMessage ? palette.userMessageBackground : palette.background;
  const assistantText = message.role === "agent";
  const plainTextColor = message.role === "system" ? palette.warning : palette.text;
  const transcriptMessages = messages ?? [message];
  const showFork =
    showMessageActions &&
    Boolean(message.id) &&
    shouldRenderMessageActionBar(transcriptMessages, index);
  const forkAfterPartIndex = showFork ? lastTextPartIndex(message) : -1;
  const showForkAfterContent = showFork && parts.length === 0 && message.content.trim().length > 0;
  const forkBar =
    showFork && message.id
      ? h(MessageActionBar, {
          busy,
          copy,
          focus: messageActionsFocus,
          key: "message-actions",
          messageId: message.id,
          onFork: onForkMessage,
        })
      : null;

  return h(
    "box",
    {
      style: {
        backgroundColor: rowBackground,
        flexDirection: "column",
        marginBottom: 1,
        minHeight: 2,
        paddingLeft: 1,
        paddingRight: 1,
        paddingBottom: isUserMessage ? USER_MESSAGE_VERTICAL_PADDING : 0,
        paddingTop: isUserMessage ? USER_MESSAGE_VERTICAL_PADDING : 0,
        width: "100%",
      },
    },
    ...(assistantText && parts.length === 0
      ? [
          h(MarkdownText, {
            backgroundColor: rowBackground,
            content: message.content,
            key: "content",
            streaming: message.streaming,
          }),
        ]
      : parts.length === 0
        ? [h("text", { key: "content", style: { fg: plainTextColor } }, message.content)]
        : []),
    ...(showForkAfterContent && forkBar ? [forkBar] : []),
    ...parts.flatMap((part, partIndex) => {
      const nodes: React.ReactElement[] = [];
      if (part.type === "tool") {
        // 卡片 join 按 toolCallId（与 GUI buildWorkflowRunByToolCallId 同规）。命中即渲染实时卡：
        // 工具行自己的 status 在 CreateWorkflow 上会在 run 还在飞的时候就变成 completed
        // （工具一launch完 run 就返回），所以状态必须读镜像，不能读 part.status。
        const workflowCard = workflowCardsByToolCallId?.get(part.toolCallId);
        if (workflowCard) {
          nodes.push(
            h(WorkflowRunCardView, {
              card: workflowCard,
              copy,
              expanded: expandedWorkflowRunIds?.has(workflowCard.runId) ?? false,
              key: `workflow-${part.toolCallId}`,
              terminalWidth,
            }),
          );
        } else {
          // 无命中就回落今日的文本投影（编过但没有 run、或镜像尚未补种）。
          nodes.push(
            h(ToolTranscriptPartView, {
              copy,
              key: `tool-${part.toolCallId}`,
              part,
              terminalWidth,
            }),
          );
        }
      } else if (part.type === "thought") {
        nodes.push(
          h(ThoughtTranscriptPartView, {
            copy,
            key: `thought-${partIndex}`,
            part,
          }),
        );
      } else {
        nodes.push(
          assistantText && part.format !== "plain"
            ? h(MarkdownText, {
                backgroundColor: rowBackground,
                content: part.text,
                key: `text-${partIndex}`,
                streaming: message.streaming,
              })
            : h("text", { key: `text-${partIndex}`, style: { fg: plainTextColor } }, part.text),
        );
      }

      if (forkBar && partIndex === forkAfterPartIndex) {
        nodes.push(forkBar);
      }
      return nodes;
    }),
  );
}

function CompactTimelineRow({
  copy,
  message,
  terminalWidth,
}: {
  copy: TuiCopy;
  message: Message;
  terminalWidth: number;
}): React.ReactElement {
  const timeline = message.timeline;
  if (!timeline || timeline.type !== "context_compaction") {
    return h("box", null);
  }
  const compactCopy = copy.transcript.compact;
  const label =
    timeline.status === "started"
      ? compactCopy.started
      : timeline.status === "retrying"
        ? compactCopy.retrying({
            attempt: timeline.attempt ?? 0,
            maxAttempts: timeline.maxAttempts ?? 0,
          })
        : timeline.status === "skipped"
          ? compactCopy.skipped
          : timeline.status === "failed"
            ? compactCopy.failed
            : timeline.status === "interrupted"
              ? compactCopy.interrupted
              : compactCopy.completed;
  const retry =
    timeline.status === "failed" || timeline.status === "interrupted"
      ? compactCopy.retry(timeline.command ?? "/compact")
      : undefined;
  const center = retry ? ` ${label} | ${retry} ` : ` ${label} `;
  const sideWidth = Math.max(4, Math.floor((terminalWidth - center.length - 6) / 2));
  const line = "-".repeat(sideWidth);
  const color =
    timeline.status === "failed"
      ? palette.warning
      : timeline.status === "started"
        ? palette.accent
        : timeline.status === "retrying"
          ? palette.accent
          : palette.muted;

  return h(
    "box",
    {
      style: {
        backgroundColor: palette.background,
        flexDirection: "column",
        marginBottom: 1,
        minHeight: 1,
        paddingLeft: 1,
        paddingRight: 1,
        width: "100%",
      },
    },
    h(
      "text",
      {
        key: "compact-timeline",
        style: { fg: color },
      },
      `${line}${center}${line}`,
    ),
  );
}
