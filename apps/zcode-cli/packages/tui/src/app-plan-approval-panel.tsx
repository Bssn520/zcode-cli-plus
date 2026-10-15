import React from "react";
import type { ScrollBoxRenderable } from "@mbears/opentui-core";
import { useTerminalDimensions } from "@mbears/opentui-react";
import type { PlanApprovalState } from "./app-model.js";
import { palette } from "./app-model.js";
import { MarkdownText } from "./app-markdown.js";
import { extractMermaidBlocks } from "./app-mermaid-preview.js";
import { isPlanDraftModified } from "./app-plan-approval-state.js";
import { wrapPlanApprovalHints } from "./app-plan-approval-hints.js";
import { parsePlanPreview } from "./app-plan-parse.js";
import { setActivePlanPreviewScroll } from "./app-plan-preview-scroll.js";
import type { TuiCopy } from "@zcode/i18n";
import { DEFAULT_TUI_COPY } from "./app-locale.js";

const h = React.createElement as (
  type: React.ElementType | string,
  props?: Record<string, unknown> | null,
  ...children: React.ReactNode[]
) => React.ReactElement;

const PLAN_APPROVAL_FALLBACK_CONTENT_WIDTH = 80;
const PLAN_APPROVAL_MIN_CONTENT_WIDTH = 8;
// border(2) + padding(2); matches APPROVAL_PANEL_CHROME_ROWS
const PLAN_APPROVAL_PANEL_CHROME_ROWS = 4;
// ContentPane minHeight(8) + panel/transcript marginBottom(1+1)
const PLAN_APPROVAL_VERTICAL_RESERVE = 10;
const PLAN_APPROVAL_MIN_PANEL_HEIGHT = 12;
const PLAN_APPROVAL_MIN_PREVIEW_HEIGHT = 1;
const PLAN_APPROVAL_FALLBACK_MAX_HEIGHT = 40;
const PLAN_PREVIEW_TABLE_OPTIONS = {
  style: "grid",
  // content：按内容宽度排，超出时靠 wrapMode 收缩，避免 full+边框比面板宽 2 列被裁切。
  widthMode: "content",
  wrapMode: "word",
} as const;

// 原因：高度受限的 column 里裸 text 会被 yoga 压成 0 高叠画；按 sidebar 方式钉死行高。
const PLAN_TEXT_ROW_STYLE = {
  flexShrink: 0,
  height: 1,
  truncate: true,
  width: "100%",
  wrapMode: "none",
} as const;

export function PlanApprovalPanel({
  copy = DEFAULT_TUI_COPY,
  contentWidth,
  maxHeight,
  state,
}: {
  copy?: TuiCopy;
  contentWidth?: number;
  maxHeight?: number;
  state: PlanApprovalState;
}): React.ReactElement {
  const { height: terminalHeight } = useTerminalDimensions();
  const resolvedMaxHeight =
    maxHeight ??
    Math.max(PLAN_APPROVAL_MIN_PANEL_HEIGHT, Math.floor(terminalHeight) - PLAN_APPROVAL_VERTICAL_RESERVE);
  const [measuredPreviewHeight, setMeasuredPreviewHeight] = React.useState<number | undefined>();
  const previewScrollRef = React.useRef<ScrollBoxRenderable | null>(null);
  const previewHeightRef = React.useRef(PLAN_APPROVAL_MIN_PREVIEW_HEIGHT);

  const setPreviewScrollRef = React.useCallback((scrollbox: ScrollBoxRenderable | null) => {
    previewScrollRef.current = scrollbox;
    if (!scrollbox) {
      setActivePlanPreviewScroll(undefined);
      return;
    }
    // 预览打开时钉在顶部，避免内容重建后停在空白偏移处。
    scrollbox.scrollTop = 0;
    const content = scrollbox.content;
    const previous = content.onSizeChange;
    content.onSizeChange = function onPlanPreviewContentSizeChange() {
      previous?.call(this);
      const nextHeight = Math.max(PLAN_APPROVAL_MIN_PREVIEW_HEIGHT, Math.ceil(this.height));
      setMeasuredPreviewHeight((current) => (current === nextHeight ? current : nextHeight));
    };
    const initialHeight = Math.max(PLAN_APPROVAL_MIN_PREVIEW_HEIGHT, Math.ceil(content.height));
    if (initialHeight > PLAN_APPROVAL_MIN_PREVIEW_HEIGHT) {
      setMeasuredPreviewHeight((current) => (current === initialHeight ? current : initialHeight));
    }
    setActivePlanPreviewScroll({
      get pageSize() {
        return Math.max(1, previewHeightRef.current);
      },
      scrollBy(deltaY) {
        scrollbox.scrollBy({ x: 0, y: deltaY });
      },
    });
  }, []);

  React.useEffect(() => {
    setMeasuredPreviewHeight(undefined);
    if (previewScrollRef.current) previewScrollRef.current.scrollTop = 0;
  }, [state.draftPlan]);

  React.useEffect(() => {
    return () => {
      setActivePlanPreviewScroll(undefined);
    };
  }, []);

  return PlanApprovalPanelView({
    copy,
    contentWidth,
    maxHeight: resolvedMaxHeight,
    measuredPreviewHeight,
    onPreviewHeightChange: (height) => {
      previewHeightRef.current = height;
    },
    previewScrollRef: setPreviewScrollRef,
    state,
  });
}

/** Hook-free render path for unit tests that call the panel as a plain function. */
export function PlanApprovalPanelView({
  copy = DEFAULT_TUI_COPY,
  contentWidth,
  maxHeight = PLAN_APPROVAL_FALLBACK_MAX_HEIGHT,
  measuredPreviewHeight,
  onPreviewHeightChange,
  previewScrollRef,
  state,
}: {
  copy?: TuiCopy;
  contentWidth?: number;
  maxHeight?: number;
  measuredPreviewHeight?: number;
  onPreviewHeightChange?: (height: number) => void;
  previewScrollRef?: (scrollbox: ScrollBoxRenderable | null) => void;
  state: PlanApprovalState;
}): React.ReactElement {
  const text = copy.planApproval;
  if (state.mode === "comment") {
    const targetLabel =
      state.commentTarget?.kind === "step"
        ? text.commentStepTitle(state.commentTarget.stepIndex + 1)
        : text.commentOverallTitle;
    const rows = [
      textRow("buffer", `> ${state.commentBuffer}`, palette.accent),
      textRow("help", text.commentHelp, palette.muted),
    ];
    return h(
      "box",
      {
        title: targetLabel,
        style: panelStyle(PLAN_APPROVAL_PANEL_CHROME_ROWS + rows.length),
      },
      ...rows,
    );
  }

  if (state.mode === "review") {
    const rows = [
      ...state.comments.map((comment, index) =>
        textRow(
          comment.id,
          `${index === state.selectedCommentIndex ? ">" : " "} ${formatComment(comment, text)}`,
          index === state.selectedCommentIndex ? palette.accent : palette.text,
        ),
      ),
      textRow("help", text.reviewHelp, palette.muted),
    ];
    return h(
      "box",
      {
        title: text.reviewTitle,
        style: panelStyle(PLAN_APPROVAL_PANEL_CHROME_ROWS + rows.length),
      },
      ...rows,
    );
  }

  const parsed = parsePlanPreview(state.draftPlan);
  const edited = isPlanDraftModified(state);
  const hasMermaid = extractMermaidBlocks(state.draftPlan).length > 0;
  const headerRows: React.ReactElement[] = [
    textRow("prompt", text.prompt, palette.warning),
  ];

  if (parsed.splittable) {
    if (parsed.steps.length > 0) {
      headerRows.push(textRow("steps-h", text.stepsHeading, palette.muted));
      for (const [index, step] of parsed.steps.entries()) {
        const selected = index === state.selectedStepIndex;
        const note = state.comments.find(
          (comment) => comment.kind === "step" && comment.stepIndex === index,
        );
        headerRows.push(
          textRow(
            `step-${index}`,
            `${selected ? ">" : " "} ${index + 1}. ${step}${note ? `  [${text.noteMarker}]` : ""}`,
            selected ? palette.accent : palette.text,
          ),
        );
      }
    }
    if (parsed.files.length > 0) {
      headerRows.push(textRow("files-h", text.filesHeading, palette.muted));
      for (const [index, file] of parsed.files.entries()) {
        headerRows.push(textRow(`file-${index}`, `  • ${file}`, palette.text));
      }
    }
    if (parsed.risks.length > 0) {
      headerRows.push(textRow("risks-h", text.risksHeading, palette.muted));
      for (const [index, risk] of parsed.risks.entries()) {
        headerRows.push(textRow(`risk-${index}`, `  ! ${risk}`, palette.warning));
      }
    }
  }

  headerRows.push(textRow("preview-h", text.previewHeading, palette.muted));
  if (hasMermaid) {
    headerRows.push(textRow("mermaid-hint", text.mermaidHint, palette.muted));
  }

  const footerRows: React.ReactElement[] = [];
  if (state.statusMessage) {
    footerRows.push(textRow("status", state.statusMessage, palette.warning));
  }
  const footerBits = [
    edited ? text.editedBadge : undefined,
    parsed.steps.length > 0 ? text.stepCount(parsed.steps.length) : undefined,
    state.comments.length > 0 ? text.commentCount(state.comments.length) : undefined,
  ].filter(Boolean);
  if (footerBits.length > 0) {
    footerRows.push(textRow("meta", footerBits.join(" · "), palette.muted));
  }
  const rowContentWidth = normalizePlanApprovalContentWidth(contentWidth);
  const helpLines = wrapPlanApprovalHints(text.help(state.comments.length), rowContentWidth);
  for (const [index, line] of helpLines.entries()) {
    footerRows.push(textRow(`help-${index}`, line, palette.muted));
  }

  const fixedRows = headerRows.length + footerRows.length;
  const naturalPreviewHeight = Math.max(
    PLAN_APPROVAL_MIN_PREVIEW_HEIGHT,
    measuredPreviewHeight ?? estimatePlanPreviewRows(state.draftPlan),
  );
  const previewHeight = planApprovalPreviewHeight(fixedRows, naturalPreviewHeight, maxHeight);
  onPreviewHeightChange?.(previewHeight);
  const panelHeight = PLAN_APPROVAL_PANEL_CHROME_ROWS + fixedRows + previewHeight;

  return h(
    "box",
    { title: text.title, style: panelStyle(panelHeight) },
    ...headerRows,
    h(
      "scrollbox",
      {
        key: "preview",
        ref: previewScrollRef,
        scrollX: false,
        stickyScroll: true,
        stickyStart: "top",
        style: {
          flexGrow: 0,
          flexShrink: 0,
          height: previewHeight,
          minHeight: PLAN_APPROVAL_MIN_PREVIEW_HEIGHT,
          contentOptions: { flexDirection: "column" },
        },
      },
      h(MarkdownText, {
        content: state.draftPlan,
        tableOptions: PLAN_PREVIEW_TABLE_OPTIONS,
      }),
    ),
    ...footerRows,
  );
}

export function estimatePlanPreviewRows(markdown: string): number {
  const lines = markdown.split(/\r?\n/u);
  let rows = 0;
  let inTable = false;
  for (const line of lines) {
    const tableLine = /^\s*\|/.test(line);
    if (tableLine) {
      if (!inTable) {
        inTable = true;
        // grid 表格上下边框各占一行。
        rows += 2;
      }
      rows += 1;
      continue;
    }
    if (inTable) inTable = false;
    rows += 1;
  }
  return Math.max(PLAN_APPROVAL_MIN_PREVIEW_HEIGHT, rows);
}

function textRow(key: string, body: string, fg: string): React.ReactElement {
  return h("text", { key, style: { ...PLAN_TEXT_ROW_STYLE, fg } }, body);
}

function formatComment(
  comment: PlanApprovalState["comments"][number],
  text: TuiCopy["planApproval"],
): string {
  if (comment.kind === "step") {
    return text.stepCommentSummary({
      index: (comment.stepIndex ?? 0) + 1,
      label: comment.stepLabel ?? "",
      text: comment.text,
    });
  }
  return text.overallCommentSummary(comment.text);
}

function normalizePlanApprovalContentWidth(contentWidth: number | undefined): number {
  if (contentWidth === undefined || !Number.isFinite(contentWidth)) {
    return PLAN_APPROVAL_FALLBACK_CONTENT_WIDTH;
  }
  return Math.max(PLAN_APPROVAL_MIN_CONTENT_WIDTH, Math.floor(contentWidth));
}

function planApprovalPreviewHeight(
  fixedRows: number,
  naturalPreviewHeight: number,
  maxHeight: number,
): number {
  const remaining =
    Math.floor(maxHeight) - PLAN_APPROVAL_PANEL_CHROME_ROWS - fixedRows;
  // 固定行不够放时宁可顶到 transcript，也不压缩 header/footer。
  if (remaining < PLAN_APPROVAL_MIN_PREVIEW_HEIGHT) {
    return PLAN_APPROVAL_MIN_PREVIEW_HEIGHT;
  }
  return Math.max(
    PLAN_APPROVAL_MIN_PREVIEW_HEIGHT,
    Math.min(naturalPreviewHeight, remaining),
  );
}

function panelStyle(height: number): Record<string, unknown> {
  return {
    backgroundColor: palette.panel,
    border: true,
    borderColor: palette.warning,
    flexDirection: "column",
    flexShrink: 0,
    height,
    marginBottom: 1,
    padding: 1,
    width: "100%",
  };
}
