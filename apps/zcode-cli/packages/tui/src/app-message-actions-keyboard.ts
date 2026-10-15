import type { KeyEvent } from "@mbears/opentui-core";
import type { Message } from "./app-model.js";

export const MESSAGE_ACTIONS_HOTKEY = "Ctrl+Shift+F";
export const MESSAGE_ACTIONS_NO_CANDIDATES_STATUS =
  "No completed assistant replies with an id are available to fork.";
export const MESSAGE_ACTIONS_BUSY_STATUS = "Wait until the current reply finishes before forking.";
export const MESSAGE_ACTIONS_ENTER_STATUS =
  "Message actions: ↑/↓ rows, ←/→ buttons, Enter activates, Esc returns to prompt.";

export type MessageActionsFocusState = {
  buttonIndex: number;
  messageIndex: number;
};

export type MessageActionButtonId = "fork";

export const MESSAGE_ACTION_BUTTONS: readonly MessageActionButtonId[] = ["fork"];

export function agentMessageHasText(message: Message | undefined): boolean {
  if (!message || message.role !== "agent") return false;
  if (message.content.trim().length > 0) return true;
  return (message.parts ?? []).some(
    (part) => part.type === "text" && part.text.trim().length > 0,
  );
}

export function isForkableAgentMessage(message: Message | undefined): message is Message & {
  id: string;
  role: "agent";
} {
  return Boolean(
    message &&
      message.role === "agent" &&
      typeof message.id === "string" &&
      message.id.length > 0 &&
      message.streaming !== true &&
      agentMessageHasText(message),
  );
}

export function listForkableMessageIndexes(messages: readonly Message[]): number[] {
  const indexes: number[] = [];
  let turnFinal: number | undefined;
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (message?.role === "user") {
      if (turnFinal !== undefined) indexes.push(turnFinal);
      turnFinal = undefined;
      continue;
    }
    if (isForkableAgentMessage(message)) {
      turnFinal = index;
    }
  }
  if (turnFinal !== undefined) indexes.push(turnFinal);
  return indexes;
}

export function lastTextPartIndex(message: Message): number {
  const parts = message.parts ?? [];
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index];
    if (part?.type === "text" && part.text.trim().length > 0) return index;
  }
  return -1;
}

export function isMessageActionsHotkey(key: Pick<KeyEvent, "ctrl" | "name" | "shift">): boolean {
  return key.ctrl === true && key.shift === true && key.name?.toLowerCase() === "f";
}

export function enterMessageActionsFocus(
  messages: readonly Message[],
): MessageActionsFocusState | undefined {
  const indexes = listForkableMessageIndexes(messages);
  const messageIndex = indexes[indexes.length - 1];
  if (messageIndex === undefined) {
    return undefined;
  }
  return { buttonIndex: 0, messageIndex };
}

export function moveMessageActionsRow(
  state: MessageActionsFocusState,
  messages: readonly Message[],
  delta: number,
): MessageActionsFocusState {
  const indexes = listForkableMessageIndexes(messages);
  if (indexes.length === 0) {
    return state;
  }
  const current = indexes.indexOf(state.messageIndex);
  const from = current >= 0 ? current : indexes.length - 1;
  const next = indexes[(from + delta + indexes.length * 8) % indexes.length]!;
  return { buttonIndex: state.buttonIndex, messageIndex: next };
}

export function moveMessageActionsButton(
  state: MessageActionsFocusState,
  delta: number,
): MessageActionsFocusState {
  const count = MESSAGE_ACTION_BUTTONS.length;
  const next = (state.buttonIndex + delta + count * 8) % count;
  return { ...state, buttonIndex: next };
}

export function focusedMessageActionButton(
  state: MessageActionsFocusState,
): MessageActionButtonId {
  return MESSAGE_ACTION_BUTTONS[state.buttonIndex] ?? "fork";
}

export function forkCommandForMessage(messageId: string): string {
  return `/fork ${messageId}`;
}

export function resolveMessageActionsKey(input: {
  busy: boolean;
  key: KeyEvent;
  messages: readonly Message[];
  state: MessageActionsFocusState | undefined;
}):
  | { type: "ignore" }
  | { type: "status"; status: string }
  | { type: "set"; state: MessageActionsFocusState | undefined }
  | { type: "activate"; command: string }
  | { type: "blocked"; status: string } {
  const { busy, key, messages, state } = input;

  if (!state) {
    if (!isMessageActionsHotkey(key)) {
      return { type: "ignore" };
    }
    if (busy) {
      return { type: "blocked", status: MESSAGE_ACTIONS_BUSY_STATUS };
    }
    const next = enterMessageActionsFocus(messages);
    if (!next) {
      return { type: "status", status: MESSAGE_ACTIONS_NO_CANDIDATES_STATUS };
    }
    return { type: "set", state: next };
  }

  if (key.name === "escape") {
    return { type: "set", state: undefined };
  }

  if (key.name === "up") {
    return { type: "set", state: moveMessageActionsRow(state, messages, -1) };
  }
  if (key.name === "down") {
    return { type: "set", state: moveMessageActionsRow(state, messages, 1) };
  }
  if (key.name === "left" || (key.name === "tab" && key.shift)) {
    return { type: "set", state: moveMessageActionsButton(state, -1) };
  }
  if (key.name === "right" || key.name === "tab") {
    return { type: "set", state: moveMessageActionsButton(state, 1) };
  }

  if (key.name === "return" || key.name === "enter") {
    if (busy) {
      return { type: "blocked", status: MESSAGE_ACTIONS_BUSY_STATUS };
    }
    const message = messages[state.messageIndex];
    if (!isForkableAgentMessage(message)) {
      return { type: "status", status: MESSAGE_ACTIONS_NO_CANDIDATES_STATUS };
    }
    if (focusedMessageActionButton(state) === "fork") {
      return { type: "activate", command: forkCommandForMessage(message.id) };
    }
  }

  return { type: "ignore" };
}
