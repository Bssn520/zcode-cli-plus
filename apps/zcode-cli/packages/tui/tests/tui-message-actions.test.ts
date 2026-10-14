import assert from "node:assert/strict";
import test from "node:test";
import type { KeyEvent } from "@mbears/opentui-core";
import { getZCodeCopy } from "@zcode/i18n";
import { MessageActionBar, shouldRenderMessageActionBar } from "../src/app-message-actions.js";
import {
  MESSAGE_ACTIONS_BUSY_STATUS,
  enterMessageActionsFocus,
  forkCommandForMessage,
  isForkableAgentMessage,
  resolveMessageActionsKey,
} from "../src/app-message-actions-keyboard.js";
import type { Message } from "../src/app-model.js";

function key(name: string, overrides: Partial<KeyEvent> = {}): KeyEvent {
  return {
    ctrl: false,
    meta: false,
    name,
    raw: name,
    shift: false,
    ...overrides,
  } as KeyEvent;
}

const messages: Message[] = [
  { id: "msg_user", role: "user", content: "hi" },
  { id: "msg_a1", role: "agent", content: "first" },
  { id: "msg_a2", role: "agent", content: "second", streaming: true },
  { id: "msg_a3", role: "agent", content: "third" },
];

test("only completed agent messages with ids are forkable", () => {
  assert.equal(isForkableAgentMessage(messages[1]), true);
  assert.equal(isForkableAgentMessage(messages[2]), false);
  assert.equal(shouldRenderMessageActionBar(messages[3]!), true);
  assert.equal(shouldRenderMessageActionBar(messages[0]!), false);
});

test("Ctrl+Shift+F enters focus on the latest forkable row", () => {
  const entered = enterMessageActionsFocus(messages);
  assert.deepEqual(entered, { buttonIndex: 0, messageIndex: 3 });

  const result = resolveMessageActionsKey({
    busy: false,
    key: key("f", { ctrl: true, shift: true }),
    messages,
    state: undefined,
  });
  assert.deepEqual(result, { type: "set", state: { buttonIndex: 0, messageIndex: 3 } });
});

test("busy disables entering and activating Fork", () => {
  const blocked = resolveMessageActionsKey({
    busy: true,
    key: key("f", { ctrl: true, shift: true }),
    messages,
    state: undefined,
  });
  assert.deepEqual(blocked, { type: "blocked", status: MESSAGE_ACTIONS_BUSY_STATUS });

  const activate = resolveMessageActionsKey({
    busy: true,
    key: key("return"),
    messages,
    state: { buttonIndex: 0, messageIndex: 3 },
  });
  assert.deepEqual(activate, { type: "blocked", status: MESSAGE_ACTIONS_BUSY_STATUS });
});

test("Enter on focused Fork submits /fork msg_<id> for confirm", () => {
  const result = resolveMessageActionsKey({
    busy: false,
    key: key("return"),
    messages,
    state: { buttonIndex: 0, messageIndex: 1 },
  });
  assert.deepEqual(result, {
    type: "activate",
    command: forkCommandForMessage("msg_a1"),
  });
  assert.equal(forkCommandForMessage("msg_a1"), "/fork msg_a1");
});

test("Esc clears message action focus without activating", () => {
  const result = resolveMessageActionsKey({
    busy: false,
    key: key("escape"),
    messages,
    state: { buttonIndex: 0, messageIndex: 1 },
  });
  assert.deepEqual(result, { type: "set", state: undefined });
});

test("MessageActionBar mouse path calls onFork only when not busy", () => {
  const copy = getZCodeCopy("en-US").tui;
  let called: string | undefined;
  const element = MessageActionBar({
    busy: false,
    copy,
    messageId: "msg_a1",
    onFork: (id) => {
      called = id;
    },
  });
  const props = element.props as {
    onMouseUp?: (event: { stopPropagation(): void }) => void;
  };
  props.onMouseUp?.({ stopPropagation() {} });
  assert.equal(called, "msg_a1");

  called = undefined;
  const busyElement = MessageActionBar({
    busy: true,
    copy,
    messageId: "msg_a1",
    onFork: (id) => {
      called = id;
    },
  });
  const busyProps = busyElement.props as {
    onMouseUp?: (event: { stopPropagation(): void }) => void;
  };
  busyProps.onMouseUp?.({ stopPropagation() {} });
  assert.equal(called, undefined);
});
