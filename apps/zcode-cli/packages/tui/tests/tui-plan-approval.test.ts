import assert from "node:assert/strict";
import test from "node:test";
import type { KeyEvent } from "@mbears/opentui-core";
import type { PermissionBrokerRequest, PermissionBrokerResult } from "@zcode/contracts";
import { PlanApprovalPanel } from "../src/app-plan-approval-panel.js";
import { wrapPlanApprovalHints } from "../src/app-plan-approval-hints.js";
import { DEFAULT_TUI_COPY } from "../src/app-locale.js";
import type { ApprovalPrompt } from "../src/app-model.js";
import {
  composePlanFeedbackReason,
  createPlanApprovalResult,
  createPlanApprovalState,
  handlePlanApprovalKey,
} from "../src/app-plan-approval-state.js";
import { parsePlanPreview } from "../src/app-plan-parse.js";
import { splitEditorCommand } from "../src/app-plan-editor.js";
import { displayWidth } from "../src/app-terminal-width.js";
const SAMPLE_PLAN = `## Steps
1. Update service boundary
2. Add regression tests

## Files
- apps/zcode-cli/packages/tui/src/app-permission.ts
- apps/zcode-cli/packages/tui/src/app-plan-editor.ts

## Risks
- may rewrite shared workspace files

## Implementation
Do the work carefully.
`;

test("parses steps/files/risks and falls back for unsplittable plans", () => {
  const parsed = parsePlanPreview(SAMPLE_PLAN);
  assert.equal(parsed.splittable, true);
  assert.deepEqual(parsed.steps, ["Update service boundary", "Add regression tests"]);
  assert.ok(parsed.files.some((file) => file.includes("app-permission.ts")));
  assert.deepEqual(parsed.risks, ["may rewrite shared workspace files"]);

  const plain = parsePlanPreview("Just a paragraph with no lists or headings.");
  assert.equal(plain.splittable, false);
  assert.deepEqual(plain.steps, []);
});

test("approve without edits returns allow", () => {
  const state = createPlanApprovalState(SAMPLE_PLAN);
  const result = createPlanApprovalResult({
    locale: "en-US",
    requestInput: { plan: SAMPLE_PLAN, allowedPrompts: [{ tool: "Bash", prompt: "run tests" }] },
    state,
  });
  assert.equal(result.decision, "allow");
  assert.equal(result.modifiedInput, undefined);
});

test("approve after edit returns modify with full input and locale reason", () => {
  const state = createPlanApprovalState(SAMPLE_PLAN);
  state.draftPlan = `${SAMPLE_PLAN}\n\nExtra note.\n`;
  const input = { plan: SAMPLE_PLAN, allowedPrompts: [{ tool: "Bash", prompt: "run tests" }] };
  const en = createPlanApprovalResult({ locale: "en-US", requestInput: input, state });
  assert.equal(en.decision, "modify");
  assert.deepEqual(en.modifiedInput, { ...input, plan: state.draftPlan });
  assert.equal(en.reason, "user modified the plan");

  const zh = createPlanApprovalResult({ locale: "zh-CN", requestInput: input, state });
  assert.equal(zh.reason, "用户已修改计划");
});

test("empty-save and unchanged-save stay on allow path", () => {
  const harness = createHarness(SAMPLE_PLAN);
  harness.press(
    "g",
    { ctrl: true },
    {
      editPlan: () => ({ status: "empty" }),
    },
  );
  assert.equal(harness.state.draftPlan, SAMPLE_PLAN);
  harness.press("return");
  assert.equal(harness.result?.decision, "allow");

  const harness2 = createHarness(SAMPLE_PLAN);
  harness2.press(
    "g",
    { ctrl: true },
    {
      editPlan: () => ({ status: "unchanged" }),
    },
  );
  harness2.press("return");
  assert.equal(harness2.result?.decision, "allow");
});

test("modify path uses mocked editor content", () => {
  const harness = createHarness(SAMPLE_PLAN);
  const edited = `${SAMPLE_PLAN}\nEdited in VISUAL.\n`;
  harness.press(
    "g",
    { ctrl: true },
    {
      editPlan: () => ({ plan: edited, status: "updated" }),
    },
  );
  assert.equal(harness.state.draftPlan, edited);
  harness.press("return", {}, { locale: "en-US" });
  assert.equal(harness.result?.decision, "modify");
  assert.equal((harness.result?.modifiedInput as { plan?: string })?.plan, edited);
  assert.equal(harness.result?.reason, "user modified the plan");
});

test("accumulates step and overall comments then sends feedback", () => {
  const harness = createHarness(SAMPLE_PLAN);
  harness.press("down");
  harness.press("f");
  for (const ch of "need coverage") harness.press(ch);
  harness.press("return");
  harness.press("g");
  for (const ch of "prefer smaller PR") harness.press(ch);
  harness.press("return");
  assert.equal(harness.state.comments.length, 2);
  harness.press("r");
  harness.press("return");

  assert.equal(harness.result?.decision, "deny");
  assert.equal(harness.result?.reasonSource, "plan_approval_feedback");
  assert.equal(harness.result?.preserveReasonFormatting, true);
  assert.match(harness.result?.reason ?? "", /\[step 2\].*need coverage/u);
  assert.match(harness.result?.reason ?? "", /\[general\].*prefer smaller PR/u);
});

test("review can delete a single comment before send", () => {
  const harness = createHarness(SAMPLE_PLAN);
  harness.press("f");
  for (const ch of "first") harness.press(ch);
  harness.press("return");
  harness.press("g");
  for (const ch of "second") harness.press(ch);
  harness.press("return");
  harness.press("r");
  harness.press("d");
  assert.equal(harness.state.comments.length, 1);
  assert.equal(harness.state.comments[0]?.kind, "overall");
  harness.press("return");
  assert.match(harness.result?.reason ?? "", /\[general\] second/u);
  assert.doesNotMatch(harness.result?.reason ?? "", /first/u);
});

test("Esc denies without plan_approval_feedback", () => {
  const harness = createHarness(SAMPLE_PLAN);
  harness.press("escape");
  assert.equal(harness.result?.decision, "deny");
  assert.equal(harness.result?.reasonSource, undefined);
  assert.equal(harness.result?.reason, "Denied plan in TUI");
});

test("key map has Ctrl+G edit and no e/F bindings", () => {
  const harness = createHarness(SAMPLE_PLAN);
  const before = harness.state.draftPlan;
  harness.press("e");
  assert.equal(harness.state.mode, "browse");
  assert.equal(harness.state.draftPlan, before);
  harness.press("f", { shift: true });
  assert.equal(harness.state.mode, "browse");
  assert.equal(harness.state.comments.length, 0);

  harness.press(
    "g",
    { ctrl: true },
    {
      editPlan: () => ({ plan: `${before}\nchanged`, status: "updated" }),
    },
  );
  assert.match(harness.state.draftPlan, /changed/u);
});

test("unsplittable plan still renders preview without section error", () => {
  const plan = "Plain prose plan without structured sections.";
  const lines = collectTextNodes(PlanApprovalPanel({ state: createPlanApprovalState(plan) }));
  const text = lines.map((line) => line.text).join("\n");
  assert.match(text, /Exit plan mode|退出计划模式/u);
  assert.match(text, /Plain prose plan/u);
  assert.doesNotMatch(text, /failed to parse|Unable to parse/iu);
});

test("composePlanFeedbackReason keeps step anchors", () => {
  const reason = composePlanFeedbackReason([
    {
      id: "1",
      kind: "step",
      stepIndex: 1,
      stepLabel: "Add regression tests",
      text: "need coverage",
    },
    { id: "2", kind: "overall", text: "prefer smaller PR" },
  ]);
  assert.equal(
    reason,
    [
      "Plan feedback:",
      "- [step 2] Add regression tests: need coverage",
      "- [general] prefer smaller PR",
    ].join("\n"),
  );
});

test("plan approval help wraps at hint boundaries on narrow widths", () => {
  const help = DEFAULT_TUI_COPY.planApproval.help;
  const hints = help.split(" · ");
  const requiredKeys = ["Ctrl+G", "Enter", "Esc", "j/k"];
  // letter hints need word-ish checks so "g" does not match inside "Ctrl+G"
  const requiredHintPrefixes = ["f ", "g ", "r "];

  for (const width of [40, 60]) {
    const lines = wrapPlanApprovalHints(help, width);
    assert.ok(lines.length >= 2, `expected wrap at width ${width}`);
    for (const line of lines) {
      assert.ok(displayWidth(line) <= width, `line exceeds ${width}: ${JSON.stringify(line)}`);
      for (const part of line.split(" · ")) {
        assert.ok(hints.includes(part), `split hint fragment ${JSON.stringify(part)}`);
      }
    }
    const visible = lines.join("\n");
    for (const key of requiredKeys) {
      assert.ok(visible.includes(key), `missing ${key} at width ${width}`);
    }
    for (const prefix of requiredHintPrefixes) {
      assert.ok(visible.includes(prefix), `missing hint ${JSON.stringify(prefix)} at width ${width}`);
    }

    const panelHelpLines = collectTextNodes(
      PlanApprovalPanel({ contentWidth: width, state: createPlanApprovalState(SAMPLE_PLAN) }),
    )
      .map((line) => line.text)
      .filter((text) => hints.some((hint) => text === hint || text.includes(`${hint} · `) || text.includes(` · ${hint}`)));
    assert.deepEqual(panelHelpLines, lines);
  }

  assert.deepEqual(wrapPlanApprovalHints(help, 120), [help]);
});

test("splitEditorCommand keeps editor args", () => {
  assert.deepEqual(splitEditorCommand("code --wait"), ["code", "--wait"]);
  assert.deepEqual(splitEditorCommand('"nano -S" ignored'), ["nano -S", "ignored"]);
});

function createHarness(plan: string): {
  readonly result: PermissionBrokerResult | undefined;
  readonly state: NonNullable<ApprovalPrompt["planApprovalState"]>;
  press: (
    name: string,
    mods?: { ctrl?: boolean; meta?: boolean; shift?: boolean },
    options?: Parameters<typeof handlePlanApprovalKey>[4],
  ) => void;
} {
  let result: PermissionBrokerResult | undefined;
  let queue: ApprovalPrompt[] = [];
  const approval: ApprovalPrompt = {
    cleanup: () => undefined,
    planApprovalState: createPlanApprovalState(plan),
    reject: () => undefined,
    request: fakeRequest(plan),
    resolve: (value) => {
      result = value;
    },
    selectedDecision: "deny",
  };
  queue = [approval];
  const setQueue = (update: React.SetStateAction<ApprovalPrompt[]>) => {
    queue = typeof update === "function" ? update(queue) : update;
  };

  return {
    get result() {
      return result;
    },
    get state() {
      const current = queue[0];
      assert.ok(current?.planApprovalState);
      return current.planApprovalState;
    },
    press(name, mods = {}, options) {
      const current = queue[0];
      assert.ok(current);
      handlePlanApprovalKey(
        {
          name,
          sequence: name,
          ctrl: Boolean(mods.ctrl),
          meta: Boolean(mods.meta),
          shift: Boolean(mods.shift),
        } as KeyEvent,
        current,
        setQueue,
        () => undefined,
        options,
      );
    },
  };
}

function fakeRequest(plan: string): PermissionBrokerRequest {
  return {
    input: { plan },
    mode: "plan",
    reason: "exit plan mode",
    requestedAt: new Date(0),
    requestId: "permission-plan-1",
    riskLevel: "medium",
    ruleId: "rule-plan-1",
    sessionId: "session-1" as PermissionBrokerRequest["sessionId"],
    toolCallId: "tool-call-1" as PermissionBrokerRequest["toolCallId"],
    toolName: "ExitPlanMode",
    traceId: "trace-1" as PermissionBrokerRequest["traceId"],
  };
}

function collectTextNodes(node: unknown): Array<{ style: Record<string, unknown>; text: string }> {
  const lines: ReturnType<typeof collectTextNodes> = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const child of value) visit(child);
      return;
    }
    if (typeof value !== "object" || value === null || !("props" in value)) return;
    const element = value as {
      props?: {
        children?: unknown;
        content?: unknown;
        style?: Record<string, unknown>;
      };
      type?: unknown;
    };
    if (element.type === "text") {
      const text = collectTextLines(element.props?.children).join("");
      lines.push({ style: element.props?.style ?? {}, text });
    }
    if (typeof element.props?.content === "string") {
      lines.push({ style: {}, text: element.props.content });
    }
    visit(element.props?.children);
  };
  visit(node);
  return lines;
}

function collectTextLines(node: unknown): string[] {
  const lines: string[] = [];
  const visit = (value: unknown) => {
    if (typeof value === "string") {
      lines.push(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const child of value) visit(child);
      return;
    }
    if (typeof value === "object" && value !== null && "props" in value) {
      const element = value as { props?: { children?: unknown } };
      visit(element.props?.children);
    }
  };
  visit(node);
  return lines;
}
