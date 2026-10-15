import React from "react";
import type { TuiCopy } from "@zcode/i18n";
import type { ToolResultDisplayLine, ToolTranscriptPart } from "./app-model.js";
import { ShikiDiffView, diffViewForWidth } from "./app-shiki-diff-view.js";
import { DEFAULT_TUI_COPY } from "./app-locale.js";
import { palette } from "./app-model.js";
import {
  getToolSummariesExpanded,
  subscribeToolSummariesExpanded,
} from "./app-tool-expansion.js";
import { presentToolTranscriptPart } from "./app-tool-summary.js";
import { truncateDisplay } from "./app-terminal-width.js";
import { activeTuiTheme } from "./theme/index.js";

const MAX_OUTPUT_LINES = 8;
const OUTPUT_LINE_INDENT_WIDTH = 4;
const TOOL_DETAIL_INDENT = "  ";
const TOOL_OUTPUT_LINE_INDENT = "    ";
const COLLAPSED_MARKER = "+";
const EXPANDED_MARKER = "-";

const h = React.createElement as (
  type: React.ElementType | string,
  props?: Record<string, unknown> | null,
  ...children: React.ReactNode[]
) => React.ReactElement;

export function ToolTranscriptPartView({
  copy = DEFAULT_TUI_COPY,
  part,
  terminalWidth = 100,
  turnEnded = false,
}: {
  copy?: TuiCopy;
  part: ToolTranscriptPart;
  terminalWidth?: number;
  turnEnded?: boolean;
}): React.ReactElement | null {
  const presentation = presentToolTranscriptPart(part, copy, { turnEnded });
  if (presentation.kind === "hidden") return null;

  if (presentation.kind === "hint") {
    return renderToolHint(copy, presentation);
  }

  return h(ToolSummaryStateful, {
    part,
    summary: presentation.text,
    terminalWidth,
  });
}

function ToolSummaryStateful({
  part,
  summary,
  terminalWidth,
}: {
  part: ToolTranscriptPart;
  summary: string;
  terminalWidth: number;
}): React.ReactElement {
  const [expanded, setExpanded] = React.useState(getToolSummariesExpanded);
  React.useEffect(() => subscribeToolSummariesExpanded(setExpanded), []);
  return h(ToolTranscriptPartFrame, {
    expanded,
    onToggle: () => setExpanded((current) => !current),
    part,
    summary,
    terminalWidth,
  });
}

export function ToolTranscriptPartFrame({
  expanded,
  onToggle,
  part,
  summary,
  terminalWidth = 100,
}: {
  expanded: boolean;
  onToggle: () => void;
  part: ToolTranscriptPart;
  summary: string;
  terminalWidth?: number;
}): React.ReactElement {
  const marker = expanded ? EXPANDED_MARKER : COLLAPSED_MARKER;
  return h(
    "box",
    {
      onMouseUp: onToggle,
      style: {
        backgroundColor: "transparent",
        flexDirection: "column",
        marginTop: 1,
        width: "100%",
      },
    },
    h(
      "text",
      {
        selectable: false,
        style: { fg: palette.muted },
      },
      `${marker} ${summary}`,
    ),
    ...(expanded ? toolDetailNodes(part, terminalWidth) : []),
  );
}

function renderToolHint(
  copy: TuiCopy,
  presentation: Extract<ReturnType<typeof presentToolTranscriptPart>, { kind: "hint" }>,
): React.ReactElement {
  if (presentation.errorPrefix) {
    return h(
      "box",
      {
        style: {
          backgroundColor: "transparent",
          flexDirection: "row",
          marginTop: 1,
          width: "100%",
        },
      },
      h("text", { style: { fg: palette.danger } }, copy.transcript.tools.failMark),
      h("text", { style: { fg: palette.muted } }, ` ${presentation.text}`),
    );
  }

  return h(
    "text",
    {
      style: {
        fg: palette.muted,
        marginTop: 1,
      },
    },
    presentation.text,
  );
}

function toolDetailNodes(part: ToolTranscriptPart, terminalWidth: number): React.ReactElement[] {
  const outputLines = part.output ? restoredOutputLines(part.output, terminalWidth) : [];
  return [
    ...part.detailLines.map((line, index) =>
      h(
        "text",
        { key: `detail-${index}`, style: { fg: palette.muted } },
        `${TOOL_DETAIL_INDENT}${line}`,
      ),
    ),
    ...(part.resultDisplay
      ? [
          ...(part.resultDisplay.title
            ? [
                h(
                  "text",
                  { key: "result-title", style: { fg: palette.muted } },
                  `${TOOL_DETAIL_INDENT}${part.resultDisplay.title}`,
                ),
              ]
            : []),
          ...resultDisplayNodes(part.resultDisplay, terminalWidth),
        ]
      : []),
    ...(outputLines.length > 0
      ? [
          h(
            "text",
            { key: "output-title", style: { fg: palette.muted } },
            `${TOOL_DETAIL_INDENT}output:`,
          ),
          ...outputLines.map((line, index) =>
            h(
              "text",
              { key: `output-${index}`, style: { fg: palette.muted } },
              `${TOOL_OUTPUT_LINE_INDENT}${line}`,
            ),
          ),
        ]
      : []),
    ...(part.error
      ? [h("text", { key: "error", style: { fg: palette.danger } }, part.error)]
      : []),
  ];
}

function resultDisplayNodes(
  display: NonNullable<ToolTranscriptPart["resultDisplay"]>,
  terminalWidth: number,
): React.ReactElement[] {
  if (display.structuredPatch?.length) {
    return [
      h(ShikiDiffView, {
        filePath: display.filePath,
        key: "result-shiki-diff",
        structuredPatch: display.structuredPatch,
        terminalWidth,
        truncated: display.truncated,
        view: diffViewForWidth(terminalWidth),
      }),
    ];
  }
  return display.lines.map((line, index) =>
    h(
      "text",
      { key: `result-${index}`, style: styleForDiffLine(line) },
      `${TOOL_DETAIL_INDENT}${line.text}`,
    ),
  );
}

function styleForDiffLine(line: ToolResultDisplayLine): Record<string, string> {
  const theme = activeTuiTheme();
  if (line.tone === "addition") {
    return { bg: theme.diffAddedBg, fg: theme.diffAdded };
  }
  if (line.tone === "deletion") {
    return { bg: theme.diffRemovedBg, fg: theme.diffRemoved };
  }
  return { fg: line.tone === "meta" ? theme.diffLineNumber : theme.diffContext };
}

function restoredOutputLines(output: string, terminalWidth: number): string[] {
  const width = Math.max(20, terminalWidth - OUTPUT_LINE_INDENT_WIDTH);
  const lines = output.split(/\r?\n/u);
  const visible = lines.slice(0, MAX_OUTPUT_LINES).map((line) => truncateDisplay(line, width));
  if (lines.length > MAX_OUTPUT_LINES) {
    visible.push(`[truncated ${lines.length - MAX_OUTPUT_LINES} lines]`);
  }
  return visible.filter((line) => line.trim().length > 0);
}
