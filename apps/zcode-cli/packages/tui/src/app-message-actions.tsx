import React from "react";
import type { TuiCopy } from "@zcode/i18n";
import { palette } from "./app-model.js";
import {
  focusedMessageActionButton,
  listForkableMessageIndexes,
  type MessageActionsFocusState,
} from "./app-message-actions-keyboard.js";
import type { Message } from "./app-model.js";

const h = React.createElement as (
  type: React.ElementType | string,
  props?: Record<string, unknown> | null,
  ...children: React.ReactNode[]
) => React.ReactElement;

export function shouldRenderMessageActionBar(
  messages: readonly Message[],
  messageIndex: number,
): boolean {
  return listForkableMessageIndexes(messages).includes(messageIndex);
}

export function MessageActionBar({
  busy = false,
  copy,
  focus,
  messageId,
  onFork,
}: {
  busy?: boolean;
  copy: TuiCopy;
  focus?: MessageActionsFocusState;
  messageId: string;
  onFork?: (messageId: string) => void;
}): React.ReactElement {
  const focused = focus !== undefined;
  const buttonFocused = focused && focusedMessageActionButton(focus) === "fork";
  const disabled = busy;
  const label = copy.transcript.messageActions.fork;
  const disabledHint = copy.transcript.messageActions.busyHint;
  const prefix = buttonFocused ? "> " : "  ";
  const text = disabled
    ? `${prefix}[ ${label} ] (${disabledHint})`
    : `${prefix}[ ${label} ]`;
  const color = disabled ? palette.muted : buttonFocused ? palette.accent : palette.muted;

  return h(
    "text",
    {
      selectable: false,
      style: { fg: color, height: 1 },
      onMouseUp: (event: { stopPropagation(): void }) => {
        event.stopPropagation();
        if (disabled || !onFork) return;
        onFork(messageId);
      },
    },
    text,
  );
}
