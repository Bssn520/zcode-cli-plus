import React from "react";
import type { PlanApprovalState } from "./app-model.js";
import { palette } from "./app-model.js";
import { MarkdownText } from "./app-markdown.js";
import { isPlanDraftModified } from "./app-plan-approval-state.js";
import { wrapPlanApprovalHints } from "./app-plan-approval-hints.js";
import { parsePlanPreview } from "./app-plan-parse.js";
import type { TuiCopy } from "@zcode/i18n";
import { DEFAULT_TUI_COPY } from "./app-locale.js";

const h = React.createElement as (
  type: React.ElementType | string,
  props?: Record<string, unknown> | null,
  ...children: React.ReactNode[]
) => React.ReactElement;

const PLAN_APPROVAL_FALLBACK_CONTENT_WIDTH = 80;
const PLAN_APPROVAL_MIN_CONTENT_WIDTH = 8;

export function PlanApprovalPanel({
  copy = DEFAULT_TUI_COPY,
  contentWidth,
  state,
}: {
  copy?: TuiCopy;
  contentWidth?: number;
  state: PlanApprovalState;
}): React.ReactElement {
  const text = copy.planApproval;
  if (state.mode === "comment") {
    const targetLabel =
      state.commentTarget?.kind === "step"
        ? text.commentStepTitle(state.commentTarget.stepIndex + 1)
        : text.commentOverallTitle;
    return h(
      "box",
      { title: targetLabel, style: panelStyle() },
      h("text", { style: { fg: palette.accent } }, `> ${state.commentBuffer}`),
      h("text", { style: { fg: palette.muted } }, text.commentHelp),
    );
  }

  if (state.mode === "review") {
    return h(
      "box",
      { title: text.reviewTitle, style: panelStyle() },
      ...state.comments.map((comment, index) =>
        h(
          "text",
          {
            key: comment.id,
            style: {
              fg: index === state.selectedCommentIndex ? palette.accent : palette.text,
            },
          },
          `${index === state.selectedCommentIndex ? ">" : " "} ${formatComment(comment, text)}`,
        ),
      ),
      h("text", { style: { fg: palette.muted } }, text.reviewHelp),
    );
  }

  const parsed = parsePlanPreview(state.draftPlan);
  const edited = isPlanDraftModified(state);
  const rows: React.ReactElement[] = [
    h("text", { key: "prompt", style: { fg: palette.warning } }, text.prompt),
  ];

  if (parsed.splittable) {
    if (parsed.steps.length > 0) {
      rows.push(h("text", { key: "steps-h", style: { fg: palette.muted } }, text.stepsHeading));
      for (const [index, step] of parsed.steps.entries()) {
        const selected = index === state.selectedStepIndex;
        const note = state.comments.find(
          (comment) => comment.kind === "step" && comment.stepIndex === index,
        );
        rows.push(
          h(
            "text",
            {
              key: `step-${index}`,
              style: { fg: selected ? palette.accent : palette.text },
            },
            `${selected ? ">" : " "} ${index + 1}. ${step}${note ? `  [${text.noteMarker}]` : ""}`,
          ),
        );
      }
    }
    if (parsed.files.length > 0) {
      rows.push(h("text", { key: "files-h", style: { fg: palette.muted } }, text.filesHeading));
      for (const [index, file] of parsed.files.entries()) {
        rows.push(h("text", { key: `file-${index}`, style: { fg: palette.text } }, `  • ${file}`));
      }
    }
    if (parsed.risks.length > 0) {
      rows.push(h("text", { key: "risks-h", style: { fg: palette.muted } }, text.risksHeading));
      for (const [index, risk] of parsed.risks.entries()) {
        rows.push(
          h("text", { key: `risk-${index}`, style: { fg: palette.warning } }, `  ! ${risk}`),
        );
      }
    }
  }

  rows.push(h("text", { key: "preview-h", style: { fg: palette.muted } }, text.previewHeading));
  rows.push(h(MarkdownText, { key: "preview", content: state.draftPlan }));

  const footerBits = [
    edited ? text.editedBadge : undefined,
    parsed.steps.length > 0 ? text.stepCount(parsed.steps.length) : undefined,
    state.comments.length > 0 ? text.commentCount(state.comments.length) : undefined,
  ].filter(Boolean);
  if (footerBits.length > 0) {
    rows.push(h("text", { key: "meta", style: { fg: palette.muted } }, footerBits.join(" · ")));
  }
  const rowContentWidth = normalizePlanApprovalContentWidth(contentWidth);
  const helpLines = wrapPlanApprovalHints(text.help, rowContentWidth);
  for (const [index, line] of helpLines.entries()) {
    rows.push(h("text", { key: `help-${index}`, style: { fg: palette.muted } }, line));
  }
  return h("box", { title: text.title, style: panelStyle() }, ...rows);
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

function panelStyle(): Record<string, unknown> {
  return {
    backgroundColor: palette.panel,
    border: true,
    borderColor: palette.warning,
    flexDirection: "column",
    marginBottom: 1,
    padding: 1,
    width: "100%",
  };
}
