import {
  ASK_USER_QUESTION_TOOL_NAME,
  ENTER_PLAN_MODE_TOOL_NAME,
  EXIT_PLAN_MODE_TOOL_NAME,
} from "@zcode/contracts";
import type { TuiCopy } from "@zcode/i18n";
import type { ToolTranscriptPart } from "./app-model.js";

const MAX_SUMMARY_TARGET = 60;
const MAX_STORED_TOOL_OUTPUT = 4000;

export type ToolRowPresentation =
  | { kind: "hidden" }
  | { kind: "hint"; errorPrefix?: boolean; text: string }
  | { kind: "summary"; text: string };

export function isEnterPlanModeTool(toolName: string): boolean {
  return normalizeToolName(toolName) === normalizeToolName(ENTER_PLAN_MODE_TOOL_NAME);
}

export function isExitPlanModeTool(toolName: string): boolean {
  return normalizeToolName(toolName) === normalizeToolName(EXIT_PLAN_MODE_TOOL_NAME);
}

export function isAskUserQuestionTool(toolName: string): boolean {
  return normalizeToolName(toolName) === normalizeToolName(ASK_USER_QUESTION_TOOL_NAME);
}

export function isQuietPlanOrQuestionTool(toolName: string): boolean {
  return (
    isEnterPlanModeTool(toolName) ||
    isExitPlanModeTool(toolName) ||
    isAskUserQuestionTool(toolName)
  );
}

export function truncateToolOutputForTranscript(output: string): string {
  if (output.length <= MAX_STORED_TOOL_OUTPUT) return output;
  return `${output.slice(0, MAX_STORED_TOOL_OUTPUT)}\n…`;
}

export function summarizeAskUserAnswers(output: string | undefined): string | undefined {
  if (!output?.trim()) return undefined;

  try {
    const parsed = JSON.parse(output) as { answers?: Record<string, unknown> };
    if (parsed.answers && typeof parsed.answers === "object") {
      const values = Object.values(parsed.answers)
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter((value) => value.length > 0);
      if (values.length > 0) return clipSummary(values.join(", "));
    }
  } catch {
    // live ToolCallResult content is model prose, not JSON
  }

  const answers = [...output.matchAll(/"((?:\\.|[^"\\])*)"="((?:\\.|[^"\\])*)"/gu)]
    .map((match) => (match[2] ?? "").replace(/\\"/gu, '"').trim())
    .filter((value) => value.length > 0);
  if (answers.length > 0) return clipSummary(answers.join(", "));
  return undefined;
}

export function presentToolTranscriptPart(
  part: ToolTranscriptPart,
  copy: TuiCopy,
): ToolRowPresentation {
  if (isEnterPlanModeTool(part.toolName)) {
    return { kind: "hidden" };
  }

  if (isAskUserQuestionTool(part.toolName)) {
    if (part.status !== "completed") return { kind: "hidden" };
    const answers = summarizeAskUserAnswers(part.output);
    if (!answers) return { kind: "hidden" };
    return { kind: "hint", text: copy.transcript.tools.answered(answers) };
  }

  if (isExitPlanModeTool(part.toolName)) {
    if (part.status === "failed") {
      return {
        errorPrefix: true,
        kind: "hint",
        text: copy.transcript.tools.planRejected,
      };
    }
    if (part.status === "completed") {
      return { kind: "hint", text: copy.transcript.tools.planApproved };
    }
    return { kind: "hint", text: copy.transcript.tools.planSubmitted };
  }

  return { kind: "summary", text: workToolSummaryLine(part, copy) };
}

export function workToolSummaryLine(part: ToolTranscriptPart, copy: TuiCopy): string {
  const body = workToolSummaryBody(part, copy);
  if (part.status === "failed") {
    const error = part.error?.trim();
    return error
      ? `· ${body} ${copy.transcript.tools.failMark} ${clipSummary(error)}`
      : `· ${body} ${copy.transcript.tools.failMark}`;
  }
  if (part.status === "completed") {
    return `· ${body} ${copy.transcript.tools.successMark}`;
  }
  return `· ${body} ${copy.transcript.tools.runningMark}`;
}

function workToolSummaryBody(part: ToolTranscriptPart, copy: TuiCopy): string {
  const tools = copy.transcript.tools;
  const name = normalizeToolName(part.toolName);

  if (name === "bash") {
    return tools.bash(detailValue(part, "command") ?? fallbackTarget(part) ?? part.toolName);
  }
  if (name === "edit") {
    return tools.edit(pathFromTitleOrDetails(part, "Edit") ?? part.toolName);
  }
  if (name === "write") {
    return tools.write(
      pathFromTitleOrDetails(part, "Write") ?? detailValue(part, "file_path") ?? part.toolName,
    );
  }
  if (name === "read") {
    return tools.read(pathFromTitleOrDetails(part, "Read") ?? part.toolName);
  }
  if (name === "grep") {
    return tools.grep(detailValue(part, "pattern") ?? fallbackTarget(part) ?? part.toolName);
  }
  if (name === "glob") {
    return tools.glob(detailValue(part, "pattern") ?? fallbackTarget(part) ?? part.toolName);
  }
  return tools.generic(part.title?.trim() || part.toolName);
}

function pathFromTitleOrDetails(part: ToolTranscriptPart, prefix: string): string | undefined {
  const title = part.title?.trim();
  if (title?.toLowerCase().startsWith(`${prefix.toLowerCase()} `)) {
    return clipSummary(title.slice(prefix.length + 1).trim());
  }
  return detailValue(part, "file_path");
}

function detailValue(part: ToolTranscriptPart, key: string): string | undefined {
  const prefix = `${key}:`;
  for (const line of part.detailLines) {
    const trimmed = line.trim();
    if (trimmed.toLowerCase().startsWith(prefix)) {
      return clipSummary(trimmed.slice(prefix.length).trim());
    }
  }
  return undefined;
}

function fallbackTarget(part: ToolTranscriptPart): string | undefined {
  const first = part.detailLines[0]?.trim();
  if (!first) return undefined;
  const separated = first.indexOf(":");
  if (separated > 0) return clipSummary(first.slice(separated + 1).trim());
  return clipSummary(first);
}

function clipSummary(value: string): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (normalized.length <= MAX_SUMMARY_TARGET) return normalized;
  return `${normalized.slice(0, MAX_SUMMARY_TARGET - 1)}…`;
}

function normalizeToolName(toolName: string): string {
  return toolName.trim().toLowerCase();
}
