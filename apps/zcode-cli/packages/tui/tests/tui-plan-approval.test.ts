import assert from "node:assert/strict";
import test from "node:test";
import type { KeyEvent } from "@mbears/opentui-core";
import type { PermissionBrokerRequest, PermissionBrokerResult } from "@zcode/contracts";
import { PlanApprovalPanel, PlanApprovalPanelView } from "../src/app-plan-approval-panel.js";
import { wrapPlanApprovalHints } from "../src/app-plan-approval-hints.js";
import { getZCodeCopy } from "@zcode/i18n";
import { DEFAULT_TUI_COPY } from "../src/app-locale.js";
import { MarkdownText } from "../src/app-markdown.js";
import { testRender } from "@mbears/opentui-react/test-utils";
import React, { act } from "react";
import type { ApprovalPrompt } from "../src/app-model.js";
import {
  appendPlanApprovalFeedbackText,
  composePlanFeedbackReason,
  createPlanApprovalResult,
  createPlanApprovalState,
  handlePlanApprovalKey,
} from "../src/app-plan-approval-state.js";
import { parsePlanPreview } from "../src/app-plan-parse.js";
import { editPlanInExternalEditor, splitEditorCommand } from "../src/app-plan-editor.js";
import { createSuspendTerminal } from "../src/suspend-terminal.js";
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

test("approve returns allow", () => {
  const result = createPlanApprovalResult();
  assert.equal(result.decision, "allow");
  assert.equal(result.modifiedInput, undefined);
});

test("default focus is approve and Enter approves", () => {
  const harness = createHarness(SAMPLE_PLAN);
  assert.equal(harness.state.focus, "approve");
  harness.press("return");
  assert.equal(harness.result?.decision, "allow");
  assert.equal(harness.result?.reasonSource, undefined);
  assert.equal(harness.result?.modifiedInput, undefined);
});

test("Tab and arrows toggle focus between approve and feedback", () => {
  const harness = createHarness(SAMPLE_PLAN);
  assert.equal(harness.state.focus, "approve");
  harness.press("tab");
  assert.equal(harness.state.focus, "feedback");
  harness.press("down");
  assert.equal(harness.state.focus, "approve");
  harness.press("up");
  assert.equal(harness.state.focus, "feedback");
});

test("Enter in feedback with empty buffer does nothing", () => {
  const harness = createHarness(SAMPLE_PLAN);
  harness.press("tab");
  assert.equal(harness.state.focus, "feedback");
  harness.press("return");
  assert.equal(harness.result, undefined);
  assert.equal(harness.state.focus, "feedback");
});

test("Enter in feedback sends plan_approval_feedback and never approves", () => {
  const harness = createHarness(SAMPLE_PLAN);
  harness.press("tab");
  for (const ch of "prefer smaller PR") harness.press(ch);
  harness.press("return");

  assert.equal(harness.result?.decision, "deny");
  assert.equal(harness.result?.reasonSource, "plan_approval_feedback");
  assert.equal(harness.result?.preserveReasonFormatting, true);
  assert.match(harness.result?.reason ?? "", /\[general\].*prefer smaller PR/u);
  assert.equal(harness.result?.modifiedInput, undefined);
});

test("fresh plan approval state resets focus and feedback buffer", () => {
  const first = createPlanApprovalState(SAMPLE_PLAN);
  first.focus = "feedback";
  first.feedbackBuffer = "old note";
  first.statusMessage = "Opened Mermaid preview in browser";

  const second = createPlanApprovalState(`${SAMPLE_PLAN}\nRevised.\n`);
  assert.equal(second.focus, "approve");
  assert.equal(second.feedbackBuffer, "");
  assert.equal(second.statusMessage, undefined);
  assert.match(second.draftPlan, /Revised/u);
});

test("Esc denies without plan_approval_feedback", () => {
  const harness = createHarness(SAMPLE_PLAN);
  harness.press("escape");
  assert.equal(harness.result?.decision, "deny");
  assert.equal(harness.result?.reasonSource, undefined);
  assert.equal(harness.result?.reason, "Denied plan in TUI");
});

test("removed leader keys no longer open edit/comment/review", () => {
  const harness = createHarness(SAMPLE_PLAN);
  const before = harness.state.draftPlan;
  harness.press("f");
  harness.press("g");
  harness.press("r");
  harness.press("g", { ctrl: true });
  assert.equal(harness.state.focus, "approve");
  assert.equal(harness.state.draftPlan, before);
  assert.equal(harness.state.feedbackBuffer, "");
  assert.equal(harness.result, undefined);
});

test("feedback buffer keeps every char when approval object is stale across key events", () => {
  let queue: ApprovalPrompt[] = [];
  const approval: ApprovalPrompt = {
    cleanup: () => undefined,
    planApprovalState: createPlanApprovalState(SAMPLE_PLAN),
    reject: () => undefined,
    request: fakeRequest(SAMPLE_PLAN),
    resolve: () => undefined,
    selectedDecision: "deny",
  };
  queue = [approval];
  const setQueue = (update: React.SetStateAction<ApprovalPrompt[]>) => {
    queue = typeof update === "function" ? update(queue) : update;
  };

  handlePlanApprovalKey({ name: "tab", sequence: "tab" } as KeyEvent, queue[0]!, setQueue, () => undefined);
  const stale = queue[0];
  assert.ok(stale);

  for (const name of ["h", "e", "l", "l", "o"]) {
    handlePlanApprovalKey({ name, sequence: name } as KeyEvent, stale, setQueue, () => undefined);
  }
  handlePlanApprovalKey(
    { name: "", sequence: " world" } as KeyEvent,
    stale,
    setQueue,
    () => undefined,
  );

  assert.equal(queue[0]?.planApprovalState?.feedbackBuffer, "hello world");
});

test("feedback buffer accepts bracketed-paste text including newlines as spaces", () => {
  let queue: ApprovalPrompt[] = [];
  const prompt: ApprovalPrompt = {
    cleanup: () => undefined,
    planApprovalState: createPlanApprovalState(SAMPLE_PLAN),
    reject: () => undefined,
    request: fakeRequest(SAMPLE_PLAN),
    resolve: () => undefined,
    selectedDecision: "deny",
  };
  queue = [prompt];
  const setQueue = (update: React.SetStateAction<ApprovalPrompt[]>) => {
    queue = typeof update === "function" ? update(queue) : update;
  };
  handlePlanApprovalKey({ name: "tab", sequence: "tab" } as KeyEvent, queue[0]!, setQueue, () => undefined);
  const stale = queue[0]!;
  assert.equal(appendPlanApprovalFeedbackText("alpha\nbeta\r\ngamma", stale, setQueue), true);
  assert.equal(queue[0]?.planApprovalState?.feedbackBuffer, "alpha beta gamma");
});

test("unsplittable plan still renders markdown preview without section error", () => {
  const plan = "Plain prose plan without structured sections.";
  const lines = collectTextNodes(PlanApprovalPanelView({ state: createPlanApprovalState(plan) }));
  const text = lines.map((line) => line.text).join("\n");
  assert.match(text, /Plain prose plan/u);
  assert.match(text, /Approve|批准/u);
  assert.doesNotMatch(text, /failed to parse|Unable to parse/iu);
  assert.doesNotMatch(text, /\bSteps\b|\bFiles\b|\bRisks\b/u);
});

test("composePlanFeedbackReason wraps overall feedback", () => {
  assert.equal(
    composePlanFeedbackReason("prefer smaller PR"),
    ["Plan feedback:", "- [general] prefer smaller PR"].join("\n"),
  );
});

test("plan approval help wraps and omits removed shortcuts", () => {
  const help = DEFAULT_TUI_COPY.planApproval.help(false);
  assert.match(help, /PgUp\/PgDn scroll/u);
  assert.doesNotMatch(help, /Ctrl\+G|Enter approve|Esc cancel|j\/k|f step|g overall|r review/u);

  const withMermaid = DEFAULT_TUI_COPY.planApproval.help(true);
  assert.match(withMermaid, /o open Mermaid/u);

  const zh = getZCodeCopy("zh-CN").tui.planApproval;
  assert.equal(zh.approveLabel, "批准");
  assert.match(zh.feedbackPlaceholder, /输入修改意见/u);
  assert.match(zh.help(true), /o 打开 Mermaid/u);

  for (const width of [20, 40]) {
    const lines = wrapPlanApprovalHints(withMermaid, width);
    assert.ok(lines.length >= 1);
    for (const line of lines) {
      assert.ok(displayWidth(line) <= Math.max(width, displayWidth(line.split(" · ")[0] ?? "")));
    }
  }
  assert.deepEqual(wrapPlanApprovalHints(help, 160), [help]);
});

test("panel footer shows approve button and feedback placeholder", () => {
  const state = createPlanApprovalState(SAMPLE_PLAN);
  const panelText = collectTextNodes(PlanApprovalPanelView({ state }))
    .map((line) => line.text)
    .join("\n");
  assert.match(panelText, /> Approve/u);
  assert.match(panelText, /Enter revision feedback/u);
  assert.match(panelText, /PgUp\/PgDn scroll/u);
  assert.doesNotMatch(panelText, /Ctrl\+G|Esc cancel|N steps|\d+ steps/u);
  assert.doesNotMatch(panelText, /^Steps$/mu);
});

test("plan approval panel stacks footer rows without overlap in opentui renderer", async () => {
  const help = DEFAULT_TUI_COPY.planApproval.help(false);
  const viewport = { width: 120, height: 40, contentWidth: 100 } as const;

  let view: Awaited<ReturnType<typeof testRender>> | undefined;
  await act(async () => {
    view = await testRender(
      React.createElement(
        "box",
        { style: { flexDirection: "column", height: viewport.height, width: viewport.width } },
        React.createElement(PlanApprovalPanel, {
          contentWidth: viewport.contentWidth,
          maxHeight: viewport.height - 10,
          state: createPlanApprovalState(SAMPLE_PLAN),
        }),
      ),
      {
        height: viewport.height,
        kittyKeyboard: true,
        otherModifiersMode: true,
        width: viewport.width,
      },
    );
    await view.flush();
  });

  try {
    assert.ok(view);
    const lines = view
      .captureCharFrame()
      .split("\n")
      .map((line) => line.trimEnd());
    const nonEmpty = lines.filter((line) => line.trim().length > 0);

    const approveIdx = nonEmpty.findIndex((line) => /(^|\s)>?\s*Approve\b/u.test(line));
    const feedbackIdx = nonEmpty.findIndex((line) => line.includes("revision feedback"));
    assert.ok(approveIdx >= 0, `missing approve: ${JSON.stringify(nonEmpty.slice(-8))}`);
    assert.ok(feedbackIdx > approveIdx, `feedback not below approve: ${JSON.stringify(nonEmpty.slice(-8))}`);
    assert.equal(
      nonEmpty.some((line) => line.includes("Approve") && line.includes("revision feedback")),
      false,
      "collapsed footer row",
    );

    const helpLines = wrapPlanApprovalHints(help, viewport.contentWidth);
    const helpRowIndexes = helpLines.map((helpLine) =>
      nonEmpty.findIndex((line) => line.includes(helpLine)),
    );
    assert.ok(
      helpRowIndexes.every((index) => index >= 0),
      `missing wrapped help: ${JSON.stringify(nonEmpty.slice(-6))}`,
    );

    const bottomBorderIdx = lines.findIndex((line) => line.includes("└"));
    assert.ok(
      bottomBorderIdx >= 0 && bottomBorderIdx < viewport.height,
      `panel bottom overflows viewport (border=${bottomBorderIdx})`,
    );
  } finally {
    await act(async () => {
      view?.renderer.destroy();
    });
  }
});

test("splitEditorCommand keeps editor args", () => {
  assert.deepEqual(splitEditorCommand("code --wait"), ["code", "--wait"]);
  assert.deepEqual(splitEditorCommand('"nano -S" ignored'), ["nano -S", "ignored"]);
});

test("resume reapplies terminal size after external editor", () => {
  const applied: Array<[number, number]> = [];
  let resumed = false;
  let repainted = false;
  const suspendTerminal = createSuspendTerminal(
    {
      processResize(width: number, height: number) {
        applied.push([width, height]);
      },
      requestFullRepaintRender() {
        repainted = true;
      },
      resume() {
        resumed = true;
      },
      suspend() {},
    } as Parameters<typeof createSuspendTerminal>[0],
    () => ({ columns: 140, rows: 45 }),
  );

  suspendTerminal.suspend();
  suspendTerminal.resume();

  assert.equal(resumed, true);
  assert.deepEqual(applied, [[140, 45]]);
  assert.equal(repainted, true);
});

test("editPlanInExternalEditor maps missing fallback and non-zero exit", () => {
  const missing = editPlanInExternalEditor({
    env: {},
    plan: SAMPLE_PLAN,
    spawnSyncFn: () => {
      const error = new Error("spawnSync vi ENOENT") as NodeJS.ErrnoException;
      error.code = "ENOENT";
      return { error, status: null, signal: null };
    },
  });
  assert.equal(missing.status, "error");
  if (missing.status === "error") {
    assert.equal(missing.kind, "not_found");
  }

  const failedExit = editPlanInExternalEditor({
    env: { EDITOR: "vim" },
    plan: SAMPLE_PLAN,
    spawnSyncFn: () => ({ error: undefined, status: 2, signal: null }),
  });
  assert.equal(failedExit.status, "error");
  if (failedExit.status === "error") {
    assert.match(failedExit.message, /exited with status 2/u);
    assert.equal(failedExit.kind, undefined);
  }
});

test("PgDn scrolls preview and Enter on approve still approves", () => {
  const harness = createHarness(SAMPLE_PLAN);
  const scrolls: number[] = [];
  harness.press("pagedown", {}, {
    previewPageSize: 7,
    scrollPlanPreview: (delta) => {
      scrolls.push(delta);
    },
  });
  assert.deepEqual(scrolls, [7]);
  harness.press("pageup", {}, {
    previewPageSize: 7,
    scrollPlanPreview: (delta) => {
      scrolls.push(delta);
    },
  });
  assert.deepEqual(scrolls, [7, -7]);
  assert.equal(harness.state.focus, "approve");
  harness.press("return");
  assert.equal(harness.result?.decision, "allow");
});

test("up/down switch focus instead of scrolling preview", () => {
  const harness = createHarness(SAMPLE_PLAN);
  const scrolls: number[] = [];
  harness.press("down", {}, {
    scrollPlanPreview: (delta) => {
      scrolls.push(delta);
    },
  });
  assert.equal(harness.state.focus, "feedback");
  assert.deepEqual(scrolls, []);
});

test("o opens mermaid preview only while approve is focused", async () => {
  const withMermaid = createHarness(`${SAMPLE_PLAN}\n\`\`\`mermaid\ngraph TD\nA-->B\n\`\`\`\n`);
  let opened = false;
  withMermaid.press(
    "o",
    {},
    {
      locale: "en-US",
      openMermaidPreview: async () => {
        opened = true;
        return {
          kind: "opened",
          htmlPath: "/tmp/preview.html",
          open: { command: "xdg-open", opened: true },
        };
      },
    },
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(opened, true);
  assert.match(withMermaid.state.statusMessage ?? "", /Opened Mermaid preview/u);

  const typing = createHarness(`${SAMPLE_PLAN}\n\`\`\`mermaid\ngraph TD\nA-->B\n\`\`\`\n`);
  let typedOpen = false;
  typing.press("tab");
  typing.press(
    "o",
    {},
    {
      openMermaidPreview: async () => {
        typedOpen = true;
        return { kind: "none" };
      },
    },
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(typedOpen, false);
  assert.equal(typing.state.feedbackBuffer, "o");
});

test("plan preview passes tableOptions and shows mermaid help hint", () => {
  const plan = `${SAMPLE_PLAN}\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n\`\`\`mermaid\ngraph TD\nA-->B\n\`\`\`\n`;
  const state = createPlanApprovalState(plan);
  const copy = getZCodeCopy("en-US").tui;
  const node = PlanApprovalPanelView({ copy, state });
  const markdownNodes = collectElementsOfType(node, MarkdownText);
  assert.equal(markdownNodes.length, 1);
  assert.deepEqual(markdownNodes[0]?.props.tableOptions, {
    style: "grid",
    widthMode: "content",
    wrapMode: "word",
  });
  const panelText = collectTextNodes(node)
    .map((line) => line.text)
    .join("\n");
  assert.match(panelText, /o open Mermaid/u);
  assert.doesNotMatch(panelText, /Mermaid found: press o/u);
});

test("estimatePlanPreviewRows adds table border rows", async () => {
  const { estimatePlanPreviewRows } = await import("../src/app-plan-approval-panel.js");
  const plain = "one\ntwo\nthree";
  assert.equal(estimatePlanPreviewRows(plain), 3);
  const table = ["| a | b |", "| --- | --- |", "| 1 | 2 |"].join("\n");
  assert.equal(estimatePlanPreviewRows(table), 5);
});

function createHarness(plan: string): {
  readonly result: PermissionBrokerResult | undefined;
  readonly state: NonNullable<ApprovalPrompt["planApprovalState"]>;
  press: (
    name: string,
    mods?: { ctrl?: boolean; meta?: boolean; shift?: boolean },
    options?: Parameters<typeof handlePlanApprovalKey>[4],
    setStatus?: (status: string) => void,
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
    press(name, mods = {}, options, setStatus = () => undefined) {
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
        setStatus,
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

function collectElementsOfType(
  node: unknown,
  type: unknown,
): Array<{ props: Record<string, unknown> }> {
  const elements: Array<{ props: Record<string, unknown> }> = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const child of value) visit(child);
      return;
    }
    if (typeof value !== "object" || value === null || !("props" in value)) return;
    const element = value as {
      props?: { children?: unknown } & Record<string, unknown>;
      type?: unknown;
    };
    if (element.type === type) {
      elements.push({ props: element.props ?? {} });
    }
    visit(element.props?.children);
  };
  visit(node);
  return elements;
}
