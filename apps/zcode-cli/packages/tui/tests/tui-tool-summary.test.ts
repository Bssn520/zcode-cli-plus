import assert from "node:assert/strict";
import test from "node:test";
import { getZCodeCopy } from "@zcode/i18n";
import type { ToolTranscriptPart } from "../src/app-model.js";
import {
  ToolTranscriptPartFrame,
  ToolTranscriptPartView,
} from "../src/app-tool-components.js";
import {
  presentToolTranscriptPart,
  summarizeAskUserAnswers,
  workToolSummaryLine,
} from "../src/app-tool-summary.js";

const EN = getZCodeCopy("en-US").tui;
const ZH = getZCodeCopy("zh-CN").tui;

function tool(partial: Partial<ToolTranscriptPart> & Pick<ToolTranscriptPart, "toolName">): ToolTranscriptPart {
  return {
    detailLines: [],
    status: "completed",
    toolCallId: "call-1",
    type: "tool",
    ...partial,
  };
}

test("hides EnterPlanMode and pending AskUserQuestion rows", () => {
  assert.equal(
    presentToolTranscriptPart(tool({ status: "running", toolName: "EnterPlanMode" }), ZH).kind,
    "hidden",
  );
  assert.equal(
    presentToolTranscriptPart(tool({ status: "pending", toolName: "AskUserQuestion" }), ZH).kind,
    "hidden",
  );
  assert.equal(ToolTranscriptPartView({ copy: ZH, part: tool({ toolName: "EnterPlanMode" }) }), null);
});

test("renders muted AskUserQuestion hint instead of tool chrome", () => {
  const answered = presentToolTranscriptPart(
    tool({
      output: JSON.stringify({ answers: { "Which option?": "Tests" } }),
      toolName: "AskUserQuestion",
    }),
    ZH,
  );
  assert.deepEqual(answered, { kind: "hint", text: "· 已回答：Tests" });
});

test("ExitPlanMode hints stay waiting until real deny/approve", () => {
  assert.deepEqual(
    presentToolTranscriptPart(tool({ status: "pending", toolName: "ExitPlanMode" }), ZH),
    { kind: "hint", text: "· 计划已提交，等待审批…" },
  );
  assert.deepEqual(
    presentToolTranscriptPart(tool({ status: "running", toolName: "ExitPlanMode" }), ZH),
    { kind: "hint", text: "· 计划已提交，等待审批…" },
  );
  // 审批面板打开期间消息通常已非 streaming；不能把 pending 当成拒绝。
  assert.deepEqual(presentToolTranscriptPart(tool({ toolName: "ExitPlanMode" }), ZH), {
    kind: "hint",
    text: "· 计划已批准",
  });
  assert.deepEqual(
    presentToolTranscriptPart(tool({ status: "failed", toolName: "ExitPlanMode" }), ZH),
    { errorPrefix: true, kind: "hint", text: "计划未批准" },
  );
  assert.deepEqual(
    presentToolTranscriptPart(
      tool({
        output: "Denied plan in TUI",
        status: "pending",
        toolName: "ExitPlanMode",
      }),
      ZH,
    ),
    { errorPrefix: true, kind: "hint", text: "计划未批准" },
  );
  assert.deepEqual(
    presentToolTranscriptPart(
      tool({ status: "cancelled" as ToolTranscriptPart["status"], toolName: "ExitPlanMode" }),
      ZH,
    ),
    { errorPrefix: true, kind: "hint", text: "计划未批准" },
  );

  const rejectedView = ToolTranscriptPartView({
    copy: ZH,
    part: tool({ status: "failed", toolName: "ExitPlanMode" }),
  });
  const lines = collectTextNodes(rejectedView);
  assert.equal(lines[0]?.text, "✗");
  assert.equal(lines[0]?.style.fg, "#fca5a5");
  assert.equal(lines[1]?.text, " 计划未批准");
  assert.equal(lines[1]?.style.fg, "#94a3b8");
});

test("marks bash non-zero exits as failed summaries", () => {
  const bash = tool({
    detailLines: ["command: exit 3"],
    output: "Exit code 3\n",
    status: "completed",
    toolName: "Bash",
  });
  assert.equal(workToolSummaryLine(bash, ZH), "· 运行 exit 3 ✗ 退出码 3");
  assert.equal(workToolSummaryLine(bash, EN), "· run exit 3 ✗ exit code 3");
  assert.equal(
    workToolSummaryLine(
      tool({
        detailLines: ["command: false"],
        output: JSON.stringify({ exitCode: 1, status: "failed" }),
        status: "completed",
        toolName: "Bash",
      }),
      ZH,
    ),
    "· 运行 false ✗ 退出码 1",
  );
  assert.equal(
    workToolSummaryLine(
      tool({
        detailLines: ["command: true"],
        output: "ok",
        status: "completed",
        toolName: "Bash",
      }),
      ZH,
    ),
    "· 运行 true ✓",
  );
});

test("collapses work tools to one muted summary line by default", () => {
  const bash = tool({
    detailLines: ["command: npm test", "cwd: packages/tui"],
    status: "running",
    toolName: "Bash",
  });
  assert.equal(workToolSummaryLine(bash, ZH), "· 运行 npm test …");
  assert.equal(workToolSummaryLine({ ...bash, status: "completed" }, ZH), "· 运行 npm test ✓");
  assert.equal(
    workToolSummaryLine({ ...bash, error: "boom", status: "failed" }, ZH),
    "· 运行 npm test ✗ boom",
  );

  assert.equal(
    workToolSummaryLine(tool({ title: "Edit src/app.ts", toolName: "Edit" }), ZH),
    "· 修改 src/app.ts ✓",
  );
  assert.equal(
    workToolSummaryLine(tool({ detailLines: ["file_path: a.txt"], toolName: "Write" }), ZH),
    "· 写入 a.txt ✓",
  );
  assert.equal(
    workToolSummaryLine(tool({ title: "Read src/x.ts", toolName: "Read" }), ZH),
    "· 读取 src/x.ts ✓",
  );
  assert.equal(
    workToolSummaryLine(tool({ detailLines: ["pattern: foo"], toolName: "Grep" }), ZH),
    "· 搜索 foo ✓",
  );

  const view = ToolTranscriptPartFrame({
    expanded: false,
    onToggle() {},
    part: bash,
    summary: workToolSummaryLine(bash, EN),
  });
  const lines = collectTextNodes(view);
  assert.equal(lines.length, 1);
  assert.equal(lines[0]?.text, "+ · run npm test …");
  assert.equal(lines[0]?.style.fg, "#94a3b8");
});

test("summarizeAskUserAnswers reads JSON resume output and live prose", () => {
  assert.equal(
    summarizeAskUserAnswers(JSON.stringify({ answers: { q: "A", other: "B" } })),
    "A, B",
  );
  assert.equal(
    summarizeAskUserAnswers('User has answered your questions: "q"="Ship it". You can now continue.'),
    "Ship it",
  );
});

function collectTextNodes(node: unknown): Array<{ style: Record<string, unknown>; text: string }> {
  const lines: ReturnType<typeof collectTextNodes> = [];
  const visit = (value: unknown) => {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value.map((child) => visit(child)).join("");
    if (typeof value !== "object" || value === null || !("props" in value)) return "";
    const element = value as {
      props?: { children?: unknown; style?: Record<string, unknown> };
      type?: unknown;
    };
    const text = visit(element.props?.children);
    if (element.type === "text") {
      lines.push({ style: element.props?.style ?? {}, text });
    }
    return text;
  };
  visit(node);
  return lines;
}
