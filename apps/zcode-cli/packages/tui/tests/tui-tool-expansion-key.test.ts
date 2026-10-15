import assert from "node:assert/strict";
import test from "node:test";
import type { KeyEvent } from "@mbears/opentui-core";
import type { Message, ToolTranscriptPart } from "../src/app-model.js";
import {
  messagesHaveWorkToolSummaries,
  resetToolSummariesExpansionForTests,
  subscribeToolSummariesExpanded,
  toggleAllToolSummaries,
  toolExpansionActionFor,
} from "../src/app-tool-expansion.js";

// Ctrl+E is OpenTUI textarea line-end: only claim it on an empty draft with work-tool rows.

function key(name: string | undefined, overrides: Partial<KeyEvent> = {}): KeyEvent {
  return {
    ctrl: false,
    meta: false,
    name,
    raw: name ?? "",
    shift: false,
    ...overrides,
  } as KeyEvent;
}

function toolPart(toolName: string): ToolTranscriptPart {
  return {
    detailLines: [],
    status: "completed",
    toolCallId: `call-${toolName}`,
    toolName,
    type: "tool",
  };
}

function agentWithTools(...toolNames: string[]): Message {
  return {
    content: "",
    parts: toolNames.map(toolPart),
    role: "agent",
  };
}

test("Ctrl+E with empty draft and summaries toggles", () => {
  assert.equal(
    toolExpansionActionFor({
      key: key("e", { ctrl: true }),
      draftValue: "",
      hasSummaries: true,
    }),
    "toggle",
  );
});

test("accepts uppercase key name from terminals", () => {
  assert.equal(
    toolExpansionActionFor({
      key: key("E", { ctrl: true }),
      draftValue: "",
      hasSummaries: true,
    }),
    "toggle",
  );
});

test("Shift/Meta variants are never claimed", () => {
  assert.equal(
    toolExpansionActionFor({
      key: key("e", { ctrl: true, shift: true }),
      draftValue: "",
      hasSummaries: true,
    }),
    undefined,
  );
  assert.equal(
    toolExpansionActionFor({
      key: key("e", { ctrl: true, meta: true }),
      draftValue: "",
      hasSummaries: true,
    }),
    undefined,
  );
});

test("non-empty draft keeps Ctrl+E as textarea line-end", () => {
  assert.equal(
    toolExpansionActionFor({
      key: key("e", { ctrl: true }),
      draftValue: "npm test",
      hasSummaries: true,
    }),
    undefined,
  );
});

test("no work-tool summaries means Ctrl+E is ignored", () => {
  assert.equal(
    toolExpansionActionFor({
      key: key("e", { ctrl: true }),
      draftValue: "",
      hasSummaries: false,
    }),
    undefined,
  );
});

test("bare e without ctrl is ignored", () => {
  assert.equal(
    toolExpansionActionFor({
      key: key("e"),
      draftValue: "",
      hasSummaries: true,
    }),
    undefined,
  );
});

test("messagesHaveWorkToolSummaries ignores quiet plan/question tools", () => {
  assert.equal(messagesHaveWorkToolSummaries([]), false);
  assert.equal(
    messagesHaveWorkToolSummaries([agentWithTools("EnterPlanMode", "AskUserQuestion", "ExitPlanMode")]),
    false,
  );
  assert.equal(messagesHaveWorkToolSummaries([agentWithTools("Bash")]), true);
  assert.equal(
    messagesHaveWorkToolSummaries([agentWithTools("ExitPlanMode"), agentWithTools("Read")]),
    true,
  );
});

test("toggleAllToolSummaries broadcasts to subscribers", () => {
  resetToolSummariesExpansionForTests();
  const seen: boolean[] = [];
  const unsubscribe = subscribeToolSummariesExpanded((expanded) => {
    seen.push(expanded);
  });

  assert.equal(toggleAllToolSummaries(), true);
  assert.equal(toggleAllToolSummaries(), false);
  assert.deepEqual(seen, [true, false]);

  unsubscribe();
  assert.equal(toggleAllToolSummaries(), true);
  assert.deepEqual(seen, [true, false]);
  resetToolSummariesExpansionForTests();
});
